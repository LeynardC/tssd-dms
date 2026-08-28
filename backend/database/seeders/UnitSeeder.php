<?php

namespace Database\Seeders;

use App\Models\Unit;
use Illuminate\Database\Seeder;

class UnitSeeder extends Seeder
{
    public function run(): void
    {
        $units = [
            ['code' => 'unit_001', 'name' => 'Unit 001'],
            ['code' => 'unit_002', 'name' => 'Unit 002'],
            ['code' => 'unit_003', 'name' => 'Unit 003'],
        ];

        foreach ($units as $unit) {
            Unit::firstOrCreate(['code' => $unit['code']], $unit);
        }
    }
}
