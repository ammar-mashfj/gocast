<?php

namespace App\Console\Commands;

use App\Services\Lava\LavaClient;
use App\Services\Lava\LavaException;
use Illuminate\Console\Command;

/**
 * Prints every lava.top product and offer on the account, hidden ones too,
 * so the two offer ids for .env can be copied rather than dug out of the
 * lava.top dashboard.
 */
class LavaProducts extends Command
{
    protected $signature = 'lava:products';

    protected $description = 'List lava.top products and their offer ids';

    public function handle(LavaClient $lava): int
    {
        try {
            $products = $lava->products();
        } catch (LavaException $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        $rows = [];

        foreach ($products as $product) {
            foreach ((array) ($product['offers'] ?? [[]]) as $offer) {
                $prices = collect((array) ($offer['prices'] ?? []))
                    ->map(fn (array $price) => ($price['amount'] ?? '—').' '.($price['currency'] ?? '').' '.strtolower((string) ($price['periodicity'] ?? '')))
                    ->implode(', ');

                $rows[] = [
                    $product['type'] ?? '?',
                    $product['title'] ?? '?',
                    $offer['name'] ?? '',
                    $offer['id'] ?? '',
                    ($product['isDynamicPrice'] ?? false) || $prices === '' ? 'price through the API' : $prices,
                ];
            }
        }

        $this->table(['Type', 'Product', 'Offer', 'Offer id', 'Prices'], $rows);
        $this->line('Put the membership offer id in LAVA_MEMBERSHIP_OFFER_ID and the "price through the API" product\'s in LAVA_PACK_OFFER_ID.');

        return self::SUCCESS;
    }
}
