<script setup lang="ts">
import { ref } from "vue";

const props = withDefaults(
  defineProps<{
    id: string;
    label: string;
    modelValue: string;
    autocomplete?: string;
    required?: boolean;
    minlength?: number;
  }>(),
  {
    autocomplete: "current-password",
    required: true,
    minlength: undefined,
  },
);

defineEmits<{
  "update:modelValue": [value: string];
}>();

const showPassword = ref(false);
</script>

<template>
  <div>
    <label :for="id" class="block text-sm font-medium text-black/70 mb-1">{{
      label
    }}</label>
    <div class="relative">
      <input
        :id="id"
        :value="modelValue"
        @input="
          $emit('update:modelValue', ($event.target as HTMLInputElement).value)
        "
        :type="showPassword ? 'text' : 'password'"
        :autocomplete="autocomplete"
        :required="required"
        :minlength="minlength"
        class="w-full border border-black/20 rounded px-3 py-2 pr-10 focus:outline-none focus:border-dole-blue"
      />
      <button
        type="button"
        @click="showPassword = !showPassword"
        :aria-label="showPassword ? 'Hide password' : 'Show password'"
        class="absolute inset-y-0 right-0 flex items-center px-3 text-black/40 hover:text-black/70"
        tabindex="-1"
      >
        <svg
          v-if="!showPassword"
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path
            d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 11 8 11 8a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.5 13.5 0 0 0 1 12s4 8 11 8a10.44 10.44 0 0 0 5.39-1.61"
          />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </button>
    </div>
  </div>
</template>
