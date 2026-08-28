<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// retired_at was whole-second precision (the unspecified Laravel default),
// which two separate retire() calls landing in the same second turn into a
// real collision -- matchingDescendantIds() would then treat two unrelated
// folders as the same cascade. Widening to microseconds shrinks that window
// from "reachable by a person clicking twice quickly" to effectively never.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('folders', function (Blueprint $table) {
            $table->timestamp('retired_at', 6)->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('folders', function (Blueprint $table) {
            $table->timestamp('retired_at')->nullable()->change();
        });
    }
};
