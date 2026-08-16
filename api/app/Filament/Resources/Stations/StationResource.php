<?php

namespace App\Filament\Resources\Stations;

use App\Filament\Resources\Stations\Pages\EditStation;
use App\Filament\Resources\Stations\Pages\ListStations;
use App\Filament\Resources\Stations\Pages\ViewStation;
use App\Models\Station;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\DeleteAction;
use Filament\Actions\EditAction;
use Filament\Actions\RestoreAction;
use Filament\Actions\ViewAction;
use Filament\Facades\Filament;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Filters\TrashedFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;

class StationResource extends Resource
{
    protected static ?string $model = Station::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedRectangleStack;

    protected static string|\UnitEnum|null $navigationGroup = 'Users & Content';

    protected static ?int $navigationSort = 20;

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            TextInput::make('name')->required()->maxLength(100),
            TextInput::make('slug')->required()->maxLength(60)->unique(ignoreRecord: true),
            Textarea::make('description')->rows(4)->columnSpanFull(),
            TextInput::make('genre'),
            TextInput::make('artwork_url')->url(),
            Toggle::make('featured'),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->modifyQueryUsing(fn ($query) => $query->withExists([
                'streamSessions as has_open_session' => fn ($session) => $session->whereNull('ended_at'),
            ]))
            ->columns([
                TextColumn::make('name')->searchable()->sortable(),
                TextColumn::make('slug')->searchable(),
                TextColumn::make('user.email')->label('Owner')->searchable(),
                // A station that is "on air" is holding a Liquidsoap
                // container (memory, cpu, an Icecast slot) whether or not
                // anyone is listening — this is the column that explains
                // where the box's capacity is going.
                TextColumn::make('desired_state')
                    ->label('On air')
                    ->badge()
                    ->color(fn (string $state): string => $state === Station::STATE_RUNNING ? 'success' : 'gray')
                    ->formatStateUsing(fn (string $state): string => $state === Station::STATE_RUNNING ? 'On air' : 'Off air')
                    ->sortable(),
                // Derived, not stored — an open StreamSession is what "live"
                // means. withExists() below resolves it in one subquery
                // rather than an exists() per row.
                IconColumn::make('has_open_session')->boolean()->label('Live'),
                IconColumn::make('featured')->boolean(),
                TextColumn::make('created_at')->dateTime()->sortable()->toggleable(),
            ])
            ->filters([
                SelectFilter::make('desired_state')
                    ->label('Power')
                    ->options([
                        Station::STATE_RUNNING => 'On air',
                        Station::STATE_STOPPED => 'Off air',
                    ]),
                TernaryFilter::make('is_live')
                    ->label('Live')
                    ->queries(
                        true: fn ($query) => $query->live(),
                        false: fn ($query) => $query->whereDoesntHave(
                            'streamSessions',
                            fn ($session) => $session->whereNull('ended_at'),
                        ),
                        blank: fn ($query) => $query,
                    ),
                TernaryFilter::make('featured'),
                SelectFilter::make('user_id')
                    ->relationship('user', 'email')
                    ->searchable()
                    ->preload()
                    ->label('Owner'),
                TrashedFilter::make(),
            ])
            ->recordActions([
                Action::make('toggle_featured')
                    ->label(fn ($record) => $record->featured ? 'Unfeature' : 'Feature')
                    ->icon('heroicon-o-star')
                    ->action(function ($record) {
                        $record->update(['featured' => ! $record->featured]);
                        activity('admin')
                            ->causedBy(Filament::auth()->user())
                            ->performedOn($record)
                            ->event($record->featured ? 'featured' : 'unfeatured')
                            ->log('Station feature toggled');
                    }),
                ViewAction::make(),
                EditAction::make(),
                DeleteAction::make()
                    ->requiresConfirmation()
                    ->modalHeading('Soft-delete station')
                    ->modalDescription(fn ($record) => "Type the station slug ({$record->slug}) to confirm.")
                    ->schema([
                        TextInput::make('confirmation')
                            ->label('Type the slug to confirm')
                            ->required()
                            ->rule(fn ($record) => 'in:'.$record->slug),
                    ])
                    ->after(function ($record) {
                        activity('admin')
                            ->causedBy(Filament::auth()->user())
                            ->performedOn($record)
                            ->event('deleted')
                            ->log('Station soft-deleted');
                    }),
                RestoreAction::make(),
            ])
            ->toolbarActions([]);
    }

    public static function canViewAny(): bool
    {
        return true;
    }

    public static function canView($record): bool
    {
        return true;
    }

    public static function canCreate(): bool
    {
        return false;
    }

    public static function canEdit($record): bool
    {
        return true;
    }

    public static function canDelete($record): bool
    {
        return true;
    }

    public static function canRestore($record): bool
    {
        return true;
    }

    public static function getRelations(): array
    {
        return [];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListStations::route('/'),
            'view' => ViewStation::route('/{record}'),
            'edit' => EditStation::route('/{record}/edit'),
        ];
    }

    public static function getRecordRouteBindingEloquentQuery(): Builder
    {
        return parent::getRecordRouteBindingEloquentQuery()
            ->withoutGlobalScopes([
                SoftDeletingScope::class,
            ]);
    }
}
