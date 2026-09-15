{{--
    The shell an admin-composed email is poured into.

    THE CHROME IS INVITE.BLADE.PHP'S, deliberately copied rather than shared.
    The two templates say different things — that one is a designed pitch with
    its copy baked in, this one is an empty frame — and the only thing they
    have in common is the wordmark, the card and the footer. Factoring those
    out would put a partial between the invite and the markup it was exported
    as, for the benefit of one caller. If the brand changes, both change; the
    test asserts the shared colours so the drift is caught rather than noticed
    in an inbox.

    TABLE LAYOUT AND INLINE STYLES ARE NOT A STYLE CHOICE. Outlook renders
    through Word, Gmail strips <style> from forwarded mail, and neither
    supports flex or grid. Every structural rule is inlined on the element for
    that reason; the <style> block carries only the things that cannot be
    inlined (media queries, link colour) and is treated as a progressive
    enhancement.

    @verbatim guards the <style> block: its @media rules would otherwise be
    read as Blade directives.

    EVERYTHING INTERPOLATED HERE IS ESCAPED, and that is the feature. The body
    arrives from a textarea in the admin panel, so markup typed into it is
    shown as the characters that were typed rather than rendered — an admin who
    pastes a <table> gets a paragraph reading "<table>", not a broken email.
--}}
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="x-apple-disable-message-reformatting">
<title>GoCast</title>
<!--[if mso]>
<xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
<style>table,td{font-family:Helvetica,Arial,sans-serif !important;}</style>
<![endif]-->
@verbatim
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
  table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
  a{color:#ECEBE6;}
  @media only screen and (max-width:620px){
    .wrap{width:100% !important;}
    .pad{padding-left:24px !important;padding-right:24px !important;}
    .h1{font-size:26px !important;line-height:34px !important;}
  }
  @media (prefers-color-scheme:dark){
    .bg{background-color:#0F1013 !important;}
    .card{background-color:#17181D !important;}
  }
</style>
@endverbatim
</head>
<body class="bg" style="margin:0;padding:0;background-color:#0F1013;">
{{-- Preheader: the grey line next to the subject in an inbox list. The
     zero-width joiners stop the client filling that space with the first
     words of the email itself. --}}
<span style="display:none !important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;">{{ $preheader }}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</span>

<table role="presentation" class="bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#0F1013;">
<tr>
<td align="center" style="padding:40px 12px 48px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td width="600"><![endif]-->
<table role="presentation" class="wrap" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">

  <!-- Wordmark -->
  <tr>
    <td class="pad" style="padding:8px 48px 28px 48px;font-family:Helvetica,Arial,sans-serif;">
      <a href="{{ $siteUrl }}" style="text-decoration:none;color:#ECEBE6;">
        <span style="font-size:15px;line-height:20px;font-weight:bold;letter-spacing:1px;color:#ECEBE6;">GoCast</span><span style="font-size:15px;line-height:20px;letter-spacing:1px;color:#7C7E88;">.fm</span>
      </a>
    </td>
  </tr>

  <!-- Card -->
  <tr>
    <td>
      <table role="presentation" class="card" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#17181D;border:1px solid #26272E;">
        <tr>
          {{-- The bottom padding closes the card when there is no button
               under it, and hands off to the CTA row when there is. --}}
          <td class="pad" style="padding:48px 48px {{ $ctaUrl ? '8px' : '44px' }} 48px;font-family:Helvetica,Arial,sans-serif;">
            @if ($greeting)
            <!-- Greeting -->
            <p style="margin:0 0 20px 0;font-size:17px;line-height:26px;mso-line-height-rule:exactly;color:#ECEBE6;">{{ $greeting }}</p>
            @endif

            @if ($headline)
            <!-- Headline -->
            <p class="h1" style="margin:0 0 28px 0;font-size:30px;line-height:38px;mso-line-height-rule:exactly;font-weight:bold;letter-spacing:-0.4px;color:#ECEBE6;">{{ $headline }}</p>
            @endif

            <!-- Body -->
            {{-- The first paragraph is lighter and larger when there is no
                 headline above it, so a short note still opens on something
                 rather than starting in the middle of grey body copy. --}}
            @foreach ($paragraphs as $paragraph)
            <p style="margin:0 0 {{ $loop->last ? '0' : '20px' }} 0;font-size:17px;line-height:27px;mso-line-height-rule:exactly;color:{{ ! $headline && $loop->first ? '#ECEBE6' : '#C3C4CB' }};">{{ $paragraph }}</p>
            @endforeach

            <!-- Sign-off -->
            <p style="margin:28px 0 0 0;font-size:15px;line-height:24px;mso-line-height-rule:exactly;color:#C3C4CB;">{{ $signOff }}</p>
          </td>
        </tr>

        @if ($ctaUrl)
        <!-- CTA -->
        <tr>
          <td class="pad" style="padding:28px 48px 44px 48px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="#D6FF4B" style="background-color:#D6FF4B;border-radius:4px;mso-padding-alt:16px 28px;">
                  <a href="{{ $ctaUrl }}" style="display:block;padding:16px 28px;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:20px;font-weight:bold;color:#0F1013;text-decoration:none;border-radius:4px;">{{ $ctaLabel }}&nbsp;&#8594;</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        @endif
      </table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td class="pad" style="padding:28px 48px 0 48px;font-family:Helvetica,Arial,sans-serif;">
      <p style="margin:0 0 8px 0;font-size:12px;line-height:18px;mso-line-height-rule:exactly;color:#7C7E88;"><a href="{{ $siteUrl }}" style="color:#9A9CA6;text-decoration:none;">gocast.fm</a> &nbsp;&#183;&nbsp; Browser-based live radio</p>
      {{-- Present only on a marketing send. On operational mail — a reply to
           somebody who wrote in, a note about their own account — an
           unsubscribe link is not a courtesy but a false promise, because the
           next such email is going to them regardless. See RawEmail for the
           three things that flag moves together. --}}
      @if ($unsubscribeUrl)
      <p style="margin:0;font-size:12px;line-height:18px;mso-line-height-rule:exactly;color:#7C7E88;">You&#8217;re receiving this because you signed up or we wrote to you about GoCast. <a href="{{ $unsubscribeUrl }}" style="color:#9A9CA6;text-decoration:underline;">Unsubscribe</a> and we won&#8217;t write again.</p>
      @endif
    </td>
  </tr>

</table>
<!--[if mso]></td></tr></table><![endif]-->
</td>
</tr>
</table>
</body>
</html>
