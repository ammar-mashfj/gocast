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
            ->columns([
                TextColumn::make('name')->searchable()->sortable(),
                TextColumn::make('slug')->searchable(),
                TextColumn::make('user.email')->label('Owner')->searchable(),
                IconColumn::make('is_live')->boolean()->label('Live'),
                IconColumn::make('featured')->boolean(),
                TextColumn::make('created_at')->dateTime()->sortable()->toggleable(),
            ])
            ->filters([
                TernaryFilter::make('is_live')->label('Live'),
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
