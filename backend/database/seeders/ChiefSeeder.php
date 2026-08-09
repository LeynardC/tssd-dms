<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

class ChiefSeeder extends Seeder
{
    public function run(): void
    {
        $chief = User::firstOrCreate(
            ['username' => 'lorie.chief'],
            [
                'name' => 'Lorie',
                'staff_id' => 'CHIEF-001',
                'password' => 'ChangeMeNow123', // hashed automatically via the 'hashed' cast
                // 'password' => 'NewChiefPass456!', //NEW PASSWORD
                'must_change_password' => true,
                'profile_completed' => true, // Chief has no position/unit/program to declare
            ],
        );

        $chief->assignRole('chief');
    }
}