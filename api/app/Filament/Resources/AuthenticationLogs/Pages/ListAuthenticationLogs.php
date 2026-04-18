<?php

namespace App\Filament\Resources\AuthenticationLogs\Pages;

use App\Filament\Resources\AuthenticationLogs\AuthenticationLogResource;
use Filament\Resources\Pages\ListRecords;

class ListAuthenticationLogs extends ListRecords
{
    protected static string $resource = AuthenticationLogResource::class;

    protected function getHeaderActions(): array
    {
        return [];
    }
}
