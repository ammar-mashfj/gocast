<?php

namespace App\Filament\Widgets;

use App\Filament\Resources\Stations\StationResource;
use App\Models\Station;
use Filament\Actions\Action;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget as BaseWidget;
use Illuminate\Database\Eloquent\Builder;

class CurrentlyLive extends BaseWidget
{
    protected static ?int $sort = 6;

    protected int|string|array $columnSpan = 'full';

    protected static ?string $heading = 'Currently live';

    public function table(Table $table): Table
    {
        return $table
            ->query(fn (): Builder => Station::query()->where('is_live', true)->with('user'))
            ->columns([
                TextColumn::make('name')->searchable(),
                TextColumn::make('user.email')->label('Owner'),
                TextColumn::make('slug')->copyable(),
                TextColumn::make('created_at')->since(),
            ])
            ->recordActions([
                Action::make('view')->url(fn ($record) => StationResource::getUrl('view', ['record' => $record])),
            ])
            ->toolbarActions([])
            ->emptyStateHeading('No stations live right now')
            ->paginated(false);
    }
}
