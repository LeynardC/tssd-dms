<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('username')->unique()->after('id');
            $table->string('staff_id')->unique()->after('username');
            $table->string('position')->nullable()->after('staff_id');
            $table->string('unit')->nullable()->after('position');
            $table->string('assigned_program')->nullable()->after('unit');
            $table->boolean('must_change_password')->default(true)->after('password');
            $table->boolean('profile_completed')->default(false)->after('must_change_password');
            $table->string('email')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['username', 'staff_id', 'position', 'unit', 'assigned_program', 'must_change_password', 'profile_completed']);
            $table->string('email')->nullable(false)->change();
        });
    }
};