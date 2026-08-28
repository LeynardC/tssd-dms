<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('folders', function (Blueprint $table) {
            $table->timestamp('retired_at')->nullable()->after('retired');
            $table->foreignId('retired_by')->nullable()->after('retired_at')->constrained('users');
        });
    }

    public function down(): void
    {
        Schema::table('folders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('retired_by');
            $table->dropColumn('retired_at');
        });
    }
};
