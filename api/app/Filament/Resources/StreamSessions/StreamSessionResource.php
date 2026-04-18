<?php

namespace App\Filament\Resources\StreamSessions;

use App\Filament\Resources\StreamSessions\Pages\ListStreamSessions;
use App\Models\StreamSession;
use BackedEnum;
use Filament\Forms\Components\DatePicker;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\Filter;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

class StreamSessionResource extends Resource
{
    protected static ?string $model = StreamSession::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedRectangleStack;

    protected static string|\UnitEnum|null $navigationGroup = 'Users & Content';

    protected static ?int $navigationSort = 30;

    public static function form(Schema $schema): Schema
    {
        return $schema->components([]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('station.name')
                    ->label('Station')
                    ->searchable()
                    ->sortable(),
                TextColumn::make('station.user.email')->label('Owner'),
                TextColumn::make('started_at')->dateTime()->sortable(),
                TextColumn::make('ended_at')->dateTime()->placeholder('Live'),
                TextColumn::make('duration_minutes')
                    ->label('Duration (min)')
                    ->getStateUsing(fn ($record) => $record->ended_at
                        ? $record->started_at->diffInMinutes($record->ended_at)
                        : $record->started_at->diffInMinutes(now())),
                TextColumn::make('peak_listeners')->numeric()->sortable(),
                TextColumn::make('source_type')->badge(),
            ])
            ->filters([
                Filter::make('started_at')
                    ->schema([
                        DatePicker::make('from'),
                        DatePicker::make('to'),
                    ])
                    ->query(function ($query, array $data) {
                        return $query
                            ->when($data['from'] ?? null, fn ($q, $d) => $q->whereDate('started_at', '>=', $d))
                            ->when($data['to'] ?? null, fn ($q, $d) => $q->whereDate('started_at', '<=', $d));
                    }),
                SelectFilter::make('station_id')
                    ->relationship('station', 'name')
                    ->searchable()
                    ->preload(),
            ])
            ->recordActions([])
            ->toolbarActions([]);
    }

    public static function getRelations(): array
    {
        return [
            //
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListStreamSessions::route('/'),
        ];
    }
}
