<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// programs.unit and users.unit already store the right values (unit_001
// etc., matching units.code) - this only adds the missing foreign key so
// the database itself refuses a value that isn't a real unit. Column names
// and values are untouched, so nothing else has to change to match.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('programs', function (Blueprint $table) {
            $table->foreign('unit')->references('code')->on('units');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreign('unit')->references('code')->on('units');
        });
    }

    public function down(): void
    {
        Schema::table('programs', function (Blueprint $table) {
            $table->dropForeign(['unit']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['unit']);
        });
    }
};
