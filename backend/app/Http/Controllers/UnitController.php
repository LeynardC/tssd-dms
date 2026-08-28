<?php

namespace App\Http\Controllers;

use App\Models\Unit;
use App\Models\ActivityLog;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class UnitController extends Controller
{
    public function index()
    {
        $units = Unit::where('retired', false)
            ->orderBy('name')
            ->get();

        return response()->json(['units' => $units]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:255', 'alpha_dash', Rule::unique(Unit::class)],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
        ]);

        $exists = Unit::whereRaw('LOWER(name) = ?', [strtolower($validated['name'])])
            ->where('retired', false)
            ->exists();

        if ($exists) {
            abort(422, 'A unit with that name already exists.');
        }

        $unit = Unit::create([
            'code' => strtolower($validated['code']),
            'name' => trim($validated['name']),
            'description' => isset($validated['description']) ? trim($validated['description']) : null,
            'created_by' => $request->user()->id,
            'retired' => false,
        ]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'unit.created',
            subjectType: 'Unit',
            subjectId: $unit->id,
            subjectLabel: $unit->name,
            metadata: ['code' => $unit->code],
        );

        return response()->json(['unit' => $unit], 201);
    }

    public function rename(Request $request, Unit $unit)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $exists = Unit::where('id', '!=', $unit->id)
            ->whereRaw('LOWER(name) = ?', [strtolower($validated['name'])])
            ->where('retired', false)
            ->exists();

        if ($exists) {
            abort(422, 'A unit with that name already exists.');
        }

        $oldName = $unit->name;
        $unit->update(['name' => trim($validated['name'])]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'unit.renamed',
            subjectType: 'Unit',
            subjectId: $unit->id,
            subjectLabel: $unit->name,
            metadata: ['old_name' => $oldName, 'new_name' => $unit->name],
        );

        return response()->json(['unit' => $unit->fresh()]);
    }

    public function updateDescription(Request $request, Unit $unit)
    {
        $validated = $request->validate([
            'description' => ['nullable', 'string'],
        ]);

        $unit->update(['description' => $validated['description'] ?? null]);

        ActivityLog::record(
            actor: $request->user(),
            action: 'unit.description_updated',
            subjectType: 'Unit',
            subjectId: $unit->id,
            subjectLabel: $unit->name,
            metadata: [],
        );

        return response()->json(['unit' => $unit->fresh()]);
    }

    public function toggleStatus(Request $request, Unit $unit)
    {
        $unit->update(['retired' => !$unit->retired]);

        ActivityLog::record(
            actor: $request->user(),
            action: $unit->retired ? 'unit.retired' : 'unit.restored',
            subjectType: 'Unit',
            subjectId: $unit->id,
            subjectLabel: $unit->name,
            metadata: [],
        );

        return response()->json(['unit' => $unit->fresh()]);
    }
}
