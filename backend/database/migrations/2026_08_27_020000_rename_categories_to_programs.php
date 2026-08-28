<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// "Category" was always the program registry (PESO, SPES, GIP, etc.) under a
// misleading name — this rename makes the table match what every consumer
// already treats it as. Adds the profile fields (founded_at/vision/mission/
// scope) the new Program Profile page needs at the same time.
return new class extends Migration
{
    public function up(): void
    {
        Schema::rename('categories', 'programs');

        Schema::table('programs', function (Blueprint $table) {
            $table->date('founded_at')->nullable();
            $table->text('vision')->nullable();
            $table->text('mission')->nullable();
            $table->text('scope')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('programs', function (Blueprint $table) {
            $table->dropColumn(['founded_at', 'vision', 'mission', 'scope']);
        });

        Schema::rename('programs', 'categories');
    }
};
