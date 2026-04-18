<?php

namespace App\Filament\Resources\Users\RelationManagers;

use App\Filament\Resources\Stations\StationResource;
use Filament\Actions\Action;
use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class StationsRelationManager extends RelationManager
{
    protected static string $relationship = 'stations';

    public function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('name')
            ->columns([
                TextColumn::make('name')->searchable(),
                TextColumn::make('slug'),
                IconColumn::make('is_live')->boolean(),
                IconColumn::make('featured')->boolean(),
                TextColumn::make('created_at')->dateTime(),
            ])
            ->headerActions([])
            ->recordActions([
                Action::make('view')->url(fn ($record) => StationResource::getUrl('view', ['record' => $record])),
            ])
            ->toolbarActions([]);
    }
}
