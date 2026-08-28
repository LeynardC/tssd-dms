<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();

        // Baseline response headers for every route this backend serves.
        $middleware->append(\App\Http\Middleware\SecurityHeaders::class);

        $middleware->alias([
            'role' => \Spatie\Permission\Middleware\RoleMiddleware::class,
        ]);

        // Runs first for every /api request — see the 'api' limiter in
        // AppServiceProvider. Not a framework default in Laravel 11 unless
        // install:api was run, which it wasn't here.
        $middleware->prependToGroup('api', [
            'throttle:api',
        ]);

        $middleware->appendToGroup('api', [
            \App\Http\Middleware\EnsurePasswordChanged::class,
            \App\Http\Middleware\EnsureProfileCompleted::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn(Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
    })->create();
