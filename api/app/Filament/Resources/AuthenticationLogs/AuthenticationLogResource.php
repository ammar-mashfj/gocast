<?php

namespace App\Filament\Resources\AuthenticationLogs;

use App\Filament\Resources\AuthenticationLogs\Pages\ListAuthenticationLogs;
use App\Models\AuthenticationLog;
use BackedEnum;
use Filament\Forms\Components\DatePicker;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\Filter;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;

class AuthenticationLogResource extends Resource
{
    protected static ?string $model = AuthenticationLog::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedRectangleStack;

    protected static string|\UnitEnum|null $navigationGroup = 'System';

    protected static ?int $navigationSort = 20;

    public static function form(Schema $schema): Schema
    {
        return $schema->components([]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('login_at')->dateTime()->sortable()->since(),
                TextColumn::make('authenticatable_type')->badge()->label('Account type'),
                TextColumn::make('authenticatable_email')
                    ->label('Account')
                    ->getStateUsing(fn ($record) => $record->authenticatable?->email ?? '—'),
                IconColumn::make('login_successful')->boolean()->label('Success'),
                TextColumn::make('ip_address')->label('IP'),
                TextColumn::make('user_agent')->limit(40),
                TextColumn::make('logout_at')->dateTime()->since()->placeholder('—'),
            ])
            ->filters([
                SelectFilter::make('authenticatable_type')->options([
                    'admin' => 'Admin',
                    'user' => 'User',
                ])->label('Account type'),
                TernaryFilter::make('login_successful')->label('Success'),
                Filter::make('login_at')
                    ->schema([
                        DatePicker::make('from'),
                        DatePicker::make('to'),
                    ])
                    ->query(function ($query, array $data) {
                        return $query
                            ->when($data['from'] ?? null, fn ($q, $d) => $q->whereDate('login_at', '>=', $d))
                            ->when($data['to'] ?? null, fn ($q, $d) => $q->whereDate('login_at', '<=', $d));
                    }),
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
            'index' => ListAuthenticationLogs::route('/'),
        ];
    }
}
