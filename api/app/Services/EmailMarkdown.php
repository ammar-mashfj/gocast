<?php

namespace App\Services;

use Illuminate\Support\Str;
use League\CommonMark\Environment\Environment;
use League\CommonMark\Extension\CommonMark\CommonMarkCoreExtension;
use League\CommonMark\Extension\CommonMark\Node\Block\BlockQuote;
use League\CommonMark\Extension\CommonMark\Node\Block\FencedCode;
use League\CommonMark\Extension\CommonMark\Node\Block\Heading;
use League\CommonMark\Extension\CommonMark\Node\Block\IndentedCode;
use League\CommonMark\Extension\CommonMark\Node\Block\ListBlock;
use League\CommonMark\Extension\CommonMark\Node\Block\ListItem;
use League\CommonMark\Extension\CommonMark\Node\Block\ThematicBreak;
use League\CommonMark\Extension\CommonMark\Node\Inline\Code;
use League\CommonMark\Extension\CommonMark\Node\Inline\Image;
use League\CommonMark\Extension\CommonMark\Node\Inline\Link;
use League\CommonMark\Extension\CommonMark\Node\Inline\Strong;
use League\CommonMark\Extension\DefaultAttributes\DefaultAttributesExtension;
use League\CommonMark\Extension\Table\Table;
use League\CommonMark\Extension\Table\TableCell;
use League\CommonMark\Extension\Table\TableExtension;
use League\CommonMark\MarkdownConverter;
use League\CommonMark\Node\Block\Document;
use League\CommonMark\Node\Block\Paragraph;
use League\CommonMark\Node\Node;
use League\CommonMark\Renderer\ChildNodeRendererInterface;
use League\CommonMark\Renderer\NodeRendererInterface;

/**
 * Markdown, as far as an email body can carry it.
 *
 * THE BODY OF AN ADMIN-COMPOSED EMAIL IS MARKDOWN, not HTML, for the reason
 * the field used to be plain text at all: the value of sending through the
 * GoCast shell is that the result renders in Outlook, and HTML pasted into a
 * textarea is the fastest way to lose that without knowing it. Markdown keeps
 * the admin out of the markup — every element that can come out of here is
 * one this class has styled.
 *
 * INLINE STYLES ON EVERY ELEMENT, attached as the document is parsed. Outlook
 * renders through Word and Gmail strips <style> from forwarded mail, so a
 * stylesheet in the template would style the preview and nothing else. The
 * colours are the template's (emails/raw.blade.php) and have to move with it.
 *
 * WHAT IS REFUSED rather than rendered:
 *
 *   • raw HTML is escaped, so a pasted <table> reads as the characters typed;
 *   • javascript:, vbscript:, file: and data: links lose their href;
 *   • images render as their alt text — a remote image is a tracking pixel
 *     and a broken box in every client that blocks them, and nothing sent from
 *     this page needs one.
 */
final class EmailMarkdown
{
    private const BODY = '#C3C4CB';

    private const BRIGHT = '#ECEBE6';

    private const MUTED = '#7C7E88';

    private const RULE = '#26272E';

    private const FONT = 'font-family:Helvetica,Arial,sans-serif;';

    /**
     * The body as email-safe HTML.
     *
     * $lead brightens the first paragraph, for a body with no headline above
     * it — so a short note still opens on something rather than starting in
     * the middle of grey body copy.
     */
    public static function toHtml(string $markdown, bool $lead = false): string
    {
        return (string) self::converter($lead)->convert($markdown);
    }

    /**
     * The body's words with the markup taken off, for the inbox preheader.
     *
     * Read off the rendered HTML rather than the source, so what is left is
     * what the reader sees: no asterisks, no pipes, no link targets.
     */
    public static function toPlain(string $markdown): string
    {
        // The end of a block becomes a space, so table cells and list items do
        // not run together into one word; inline tags just disappear, so bold
        // does not leave a gap before the comma after it.
        $html = preg_replace('#<(/(p|li|td|th|tr|h[1-6]|blockquote|pre)|br|hr)\b[^>]*>#i', ' ', self::toHtml($markdown)) ?? '';
        $text = strip_tags($html);

        return trim(preg_replace('/\s+/u', ' ', html_entity_decode($text, ENT_QUOTES | ENT_HTML5)) ?? '');
    }

    /**
     * The opening of the body, short enough for an inbox preview line.
     */
    public static function summary(string $markdown, int $limit = 140): string
    {
        return Str::limit(self::toPlain($markdown), $limit, '');
    }

    private static function converter(bool $lead): MarkdownConverter
    {
        $environment = new Environment([
            'html_input' => 'escape',
            'allow_unsafe_links' => false,
            // Deep enough for a list inside a list, shallow enough that a
            // paste of a thousand `>` cannot make the parser work for it.
            'max_nesting_level' => 10,
            // A single newline is where the admin's textarea wrapped, not a
            // break they meant — same rule the field has always had.
            'renderer' => ['soft_break' => ' '],
            'default_attributes' => self::styles($lead),
        ]);

        $environment->addExtension(new CommonMarkCoreExtension);
        $environment->addExtension(new TableExtension);
        $environment->addExtension(new DefaultAttributesExtension);

        // Higher priority than the core image renderer, so it never runs.
        $environment->addRenderer(Image::class, new class implements NodeRendererInterface
        {
            public function render(Node $node, ChildNodeRendererInterface $childRenderer): string
            {
                return $childRenderer->renderNodes($node->children());
            }
        }, 10);

        return new MarkdownConverter($environment);
    }

    /**
     * @return array<class-string, array<string, mixed>>
     */
    private static function styles(bool $lead): array
    {
        // Top-level blocks are spaced by their bottom margin, and the last one
        // has none so the sign-off's own margin is the only gap under the body.
        $gap = fn (Node $node): string => $node->next() === null ? '0' : '20px';
        $text = 'font-size:17px;line-height:27px;mso-line-height-rule:exactly;';

        return [
            Paragraph::class => [
                'style' => function (Paragraph $node) use ($gap, $lead, $text): string {
                    $opening = $lead && $node->parent() instanceof Document && $node->previous() === null;

                    return "margin:0 0 {$gap($node)} 0;{$text}color:".($opening ? self::BRIGHT : self::BODY).';';
                },
            ],
            Heading::class => [
                'style' => fn (Heading $node) => "margin:0 0 {$gap($node)} 0;font-size:".($node->getLevel() === 1 ? '22px;line-height:30px' : '18px;line-height:26px').';mso-line-height-rule:exactly;font-weight:bold;color:'.self::BRIGHT.';',
            ],
            ListBlock::class => [
                'style' => fn (ListBlock $node) => "margin:0 0 {$gap($node)} 0;padding:0 0 0 24px;{$text}color:".self::BODY.';',
            ],
            ListItem::class => [
                'style' => fn (ListItem $node) => 'margin:0 0 '.($node->next() === null ? '0' : '8px').' 0;',
            ],
            BlockQuote::class => [
                'style' => fn (BlockQuote $node) => "margin:0 0 {$gap($node)} 0;padding:0 0 0 16px;border-left:3px solid ".self::RULE.';',
            ],
            ThematicBreak::class => [
                'style' => fn (ThematicBreak $node) => "margin:0 0 {$gap($node)} 0;border:0;border-top:1px solid ".self::RULE.';height:0;',
            ],
            FencedCode::class => [
                'style' => fn (FencedCode $node) => self::codeBlock($gap($node)),
            ],
            IndentedCode::class => [
                'style' => fn (IndentedCode $node) => self::codeBlock($gap($node)),
            ],
            Table::class => [
                'style' => fn (Table $node) => "width:100%;margin:0 0 {$gap($node)} 0;border-collapse:collapse;",
                'width' => '100%',
                'cellpadding' => '0',
                'cellspacing' => '0',
                'border' => '0',
            ],
            // Left unless the separator row says otherwise (`:-:`), stated on
            // both cells because a <th> centres itself by default.
            TableCell::class => [
                'style' => fn (TableCell $node) => self::FONT.'text-align:'.($node->getAlign() ?? 'left').';'.($node->getType() === TableCell::TYPE_HEADER
                    ? 'padding:10px 12px 10px 0;border-bottom:1px solid '.self::MUTED.';font-size:13px;line-height:18px;font-weight:bold;letter-spacing:0.5px;text-transform:uppercase;color:'.self::BRIGHT.';'
                    : 'padding:10px 12px 10px 0;border-bottom:1px solid '.self::RULE.';font-size:15px;line-height:22px;vertical-align:top;color:'.self::BODY.';'),
            ],
            Strong::class => [
                'style' => 'font-weight:bold;color:'.self::BRIGHT.';',
            ],
            Link::class => [
                'style' => 'color:'.self::BRIGHT.';text-decoration:underline;',
            ],
            Code::class => [
                'style' => 'font-family:Menlo,Consolas,monospace;font-size:15px;color:'.self::BRIGHT.';',
            ],
        ];
    }

    private static function codeBlock(string $gap): string
    {
        return "margin:0 0 {$gap} 0;padding:12px 16px;background-color:#0F1013;border:1px solid ".self::RULE.';font-family:Menlo,Consolas,monospace;font-size:14px;line-height:21px;color:'.self::BRIGHT.';white-space:pre-wrap;';
    }
}
