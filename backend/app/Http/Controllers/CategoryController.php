<?php

namespace App\Http\Controllers;

use App\Models\Category;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CategoryController extends Controller
{
    public function index()
    {
        $categories = Category::where('retired', false)
            ->orderBy('unit')
            ->orderBy('name')
            ->get();

        return response()->json(['categories' => $categories]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:255', 'alpha_dash', Rule::unique(Category::class)],
            'name' => ['required', 'string', 'max:255'],
            'unit' => ['required', 'string', Rule::in(['unit_001', 'unit_002', 'unit_003'])],
        ]);

        $exists = Category::where('unit', $validated['unit'])
            ->whereRaw('LOWER(name) = ?', [strtolower($validated['name'])])
            ->where('retired', false)
            ->exists();

        if ($exists) {
            abort(422, 'A category with that name already exists in this unit.');
        }

        $category = Category::create([
            'code' => strtolower($validated['code']),
            'name' => trim($validated['name']),
            'unit' => $validated['unit'],
            'created_by' => $request->user()->id,
            'retired' => false,
        ]);

        return response()->json(['category' => $category], 201);
    }

    public function rename(Request $request, Category $category)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
        ]);

        $exists = Category::where('unit', $category->unit)
            ->where('id', '!=', $category->id)
            ->whereRaw('LOWER(name) = ?', [strtolower($validated['name'])])
            ->where('retired', false)
            ->exists();

        if ($exists) {
            abort(422, 'A category with that name already exists in this unit.');
        }

        $category->update(['name' => trim($validated['name'])]);

        return response()->json(['category' => $category->fresh()]);
    }

    public function toggleStatus(Category $category)
    {
        $category->update(['retired' => !$category->retired]);

        return response()->json(['category' => $category->fresh()]);
    }
}
