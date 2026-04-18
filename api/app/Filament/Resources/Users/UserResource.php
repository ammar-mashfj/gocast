<?php

namespace App\Filament\Resources\Users;

use App\Filament\Resources\Users\Pages\EditUser;
use App\Filament\Resources\Users\Pages\ListUsers;
use App\Filament\Resources\Users\Pages\ViewUser;
use App\Models\User;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Actions\RestoreAction;
use Filament\Actions\ViewAction;
use Filament\Facades\Filament;
use Filament\Forms\Components\DatePicker;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\Filter;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Filters\TrashedFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\SoftDeletingScope;

class UserResource extends Resource
{
    protected static ?string $model = User::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedUsers;

    protected static string|\UnitEnum|null $navigationGroup = 'Users & Content';

    protected static ?int $navigationSort = 10;

    public static function form(Schema $schema): Schema
    {
        return $schema->components([
            TextInput::make('name')->required(),
            TextInput::make('email')->email()->required()->unique(ignoreRecord: true),
            Select::make('plan_id')->relationship('plan', 'name')->required(),
            Toggle::make('email_verified_at')
                ->label('Verified')
                ->dehydrateStateUsing(fn ($state) => $state ? now() : null)
                ->formatStateUsing(fn ($state) => $state !== null),
        ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')->searchable(),
                TextColumn::make('email')->searchable()->copyable(),
                TextColumn::make('plan.name')->badge(),
                TextColumn::make('stations_count')
                    ->counts('stations')
                    ->label('Stations')
                    ->sortable(),
                IconColumn::make('email_verified_at')->boolean()->label('Verified'),
                TextColumn::make('created_at')->dateTime()->sortable(),
                TextColumn::make('last_login_at')->dateTime()->since()->sortable(),
            ])
            ->filters([
                SelectFilter::make('plan_id')->relationship('plan', 'name')->multiple(),
                TernaryFilter::make('email_verified_at')
                    ->label('Verified')
                    ->nullable()
                    ->queries(
                        true: fn ($q) => $q->whereNotNull('email_verified_at'),
                        false: fn ($q) => $q->whereNull('email_verified_at'),
                        blank: fn ($q) => $q,
                    ),
                Filter::make('created_at')
                    ->schema([
                        DatePicker::make('from'),
                        DatePicker::make('to'),
                    ])
                    ->query(function ($query, array $data) {
                        return $query
                            ->when($data['from'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '>=', $d))
                            ->when($data['to'] ?? null, fn ($q, $d) => $q->whereDate('created_at', '<=', $d));
                    }),
                TrashedFilter::make(),
            ])
            ->recordActions([
                ViewAction::make(),
                EditAction::make(),
                Action::make('resend_verification')
                    ->icon('heroicon-o-envelope')
                    ->visible(fn ($record) => $record->email_verified_at === null)
                    ->action(function ($record) {
                        $record->sendEmailVerificationNotification();
                        activity('admin')
                            ->causedBy(Filament::auth()->user())
                            ->performedOn($record)
                            ->event('verification_resent')
                            ->log('Verification email resent');
                    }),
                Action::make('mark_verified')
                    ->icon('heroicon-o-check-badge')
                    ->visible(fn ($record) => $record->email_verified_at === null)
                    ->requiresConfirmation()
                    ->action(function ($record) {
                        $record->forceFill(['email_verified_at' => now()])->save();
                        activity('admin')
                            ->causedBy(Filament::auth()->user())
                            ->performedOn($record)
                            ->event('marked_verified')
                            ->log('Email marked verified');
                    }),
                DeleteAction::make()
                    ->requiresConfirmation()
                    ->modalHeading('Soft-delete user')
                    ->modalDescription(fn ($record) => "Type the user's email ({$record->email}) to confirm. This cascades to their stations.")
                    ->schema([
                        TextInput::make('confirmation')
                            ->required()
                            ->rule(fn ($record) => 'in:'.$record->email),
                    ])
                    ->before(function ($record) {
                        $record->tokens()->delete();
                    })
                    ->after(function ($record) {
                        $record->stations()->delete();
                        activity('admin')
                            ->causedBy(Filament::auth()->user())
                            ->performedOn($record)
                            ->event('deleted')
                            ->log('User soft-deleted with stations cascade');
                    }),
                RestoreAction::make(),
            ])
            ->toolbarActions([
                DeleteBulkAction::make()->requiresConfirmation(),
            ]);
    }

    public static function getRelations(): array
    {
        return [
            RelationManagers\StationsRelationManager::class,
            RelationManagers\StreamSessionsRelationManager::class,
        ];
    }

    public static function getPages(): array
    {
        return [
            'index' => ListUsers::route('/'),
            'view' => ViewUser::route('/{record}'),
            'edit' => EditUser::route('/{record}/edit'),
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
