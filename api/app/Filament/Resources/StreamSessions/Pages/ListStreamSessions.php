<?php

namespace App\Filament\Resources\StreamSessions\Pages;

use App\Filament\Resources\StreamSessions\StreamSessionResource;
use Filament\Resources\Pages\ListRecords;

class ListStreamSessions extends ListRecords
{
    protected static string $resource = StreamSessionResource::class;

    protected function getHeaderActions(): array
    {
        return [];
    }
}
