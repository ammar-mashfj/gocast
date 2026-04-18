<?php

namespace App\Filament\Widgets;

use App\Filament\Resources\Users\UserResource;
use App\Models\User;
use Filament\Actions\Action;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Table;
use Filament\Widgets\TableWidget as BaseWidget;
use Illuminate\Database\Eloquent\Builder;

class RecentSignups extends BaseWidget
{
    protected static ?int $sort = 5;

    protected int|string|array $columnSpan = 'full';

    protected static ?string $heading = 'Recent signups';

    public function table(Table $table): Table
    {
        return $table
            ->query(fn (): Builder => User::query()->latest()->limit(10))
            ->columns([
                TextColumn::make('name')->searchable(),
                TextColumn::make('email')->copyable(),
                TextColumn::make('plan.name')->badge(),
                TextColumn::make('created_at')->since()->sortable(),
            ])
            ->recordActions([
                Action::make('view')->url(fn ($record) => UserResource::getUrl('view', ['record' => $record->id])),
            ])
            ->toolbarActions([])
            ->paginated(false);
    }
}
