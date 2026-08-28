<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class SystemUserSeeder extends Seeder
{
    // Used as the ActivityLog actor for automated actions (e.g. the
    // Recycle Bin's scheduled purge) that don't have a logged-in user.
    // is_active = false guarantees this account can never log in — see the
    // is_active check in FortifyServiceProvider.
    public function run(): void
    {
        User::firstOrCreate(
            ['username' => 'system'],
            [
                'name' => 'System',
                'staff_id' => 'SYSTEM-000',
                'password' => Str::random(64),
                'must_change_password' => false,
                'profile_completed' => true,
                'is_active' => false,
            ],
        );
    }
}
