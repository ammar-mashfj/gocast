<?php

return [
    'free' => [
        'max_stations' => 1,
        'max_listeners' => 30,
        'max_bitrate' => 96,
        'has_ads' => true,
    ],
    'starter' => [
        'max_stations' => 2,
        'max_listeners' => 150,
        'max_bitrate' => 128,
        'has_ads' => false,
    ],
    'pro' => [
        'max_stations' => 5,
        'max_listeners' => 500,
        'max_bitrate' => 320,
        'has_ads' => false,
    ],
    'studio' => [
        'max_stations' => PHP_INT_MAX,
        'max_listeners' => PHP_INT_MAX,
        'max_bitrate' => 320,
        'has_ads' => false,
    ],
];
