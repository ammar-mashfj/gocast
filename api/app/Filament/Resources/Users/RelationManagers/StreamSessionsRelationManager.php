<?php

namespace App\Filament\Resources\Users\RelationManagers;

use Filament\Resources\RelationManagers\RelationManager;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;

class StreamSessionsRelationManager extends RelationManager
{
    protected static string $relationship = 'streamSessions';

    public function table(Table $table): Table
    {
        return $table
            ->recordTitleAttribute('id')
            ->modifyQueryUsing(fn ($query) => $query->with('station'))
            ->columns([
                TextColumn::make('station.name')->label('Station'),
                TextColumn::make('started_at')->dateTime()->sortable(),
                TextColumn::make('ended_at')->dateTime()->placeholder('Live'),
                TextColumn::make('peak_listeners')->numeric(),
                TextColumn::make('source_type')->badge(),
            ])
            ->paginated([25])
            ->headerActions([])
            ->recordActions([])
            ->toolbarActions([]);
    }
}
