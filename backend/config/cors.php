<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    // This backend is headless — every route exists to serve the Vue SPA, and
    // the only non-JSON routes (the Google OAuth redirect/callback) are
    // top-level browser navigations where an extra CORS header is inert. A
    // wildcard means a stray redirect (e.g. Fortify bouncing a non-JSON
    // request to '/') still carries Access-Control-Allow-Origin instead of
    // hard-failing the fetch with an opaque CORS error.
    'paths' => ['*'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter(array_map(
        'trim',
        explode(',', env(
            'CORS_ALLOWED_ORIGINS',
            'http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173'
        ))
    )),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => true,

];
