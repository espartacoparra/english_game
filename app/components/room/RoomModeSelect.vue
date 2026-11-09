<script setup lang="ts">
import type { RoomMode } from '~/core/room-client'
import { DEFAULT_ROOM_MODE, ROOM_MODE_OPTIONS } from './room-modes'

/**
 * The one mode picker: the multiplayer entry point and the room lobby both use
 * it, so the seven modes are listed in exactly one place.
 */
defineProps<{
  disabled?: boolean
  label?: string
}>()

const mode = defineModel<RoomMode>({ default: DEFAULT_ROOM_MODE })
</script>

<template>
  <label class="mode-select">
    <span class="mode-select-label">{{ label ?? 'Modo de juego' }}</span>
    <select v-model="mode" :disabled="disabled" class="mode-select-field">
      <option v-for="option in ROOM_MODE_OPTIONS" :key="option.id" :value="option.id">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>

<style scoped>
.mode-select {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.mode-select-label {
  font-size: 0.775rem;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.mode-select-field {
  width: 100%;
  padding: 0.65rem 0.85rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  background: var(--surface-inset);
  color: var(--text-main);
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}

.mode-select-field:focus {
  outline: none;
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.2);
}

.mode-select-field:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
