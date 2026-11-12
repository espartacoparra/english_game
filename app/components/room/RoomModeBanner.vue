<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { generateRoomCode, isValidRoomCode, normalizeRoomCode, type RoomMode } from '~/core/room-client'

const props = defineProps<{
  mode: RoomMode
  label: string
  description?: string
}>()

const router = useRouter()
const showJoinInput = ref(false)
const joinCode = ref('')
const joinError = ref('')

function createRoom() {
  const code = generateRoomCode()
  router.push(`/room/${code}?mode=${props.mode}&count=10`)
}

function handleJoin() {
  joinError.value = ''
  const code = normalizeRoomCode(joinCode.value)
  if (!isValidRoomCode(code)) {
    joinError.value = 'Código inválido (6 letras o números)'
    return
  }
  router.push(`/room/${code}`)
}
</script>

<template>
  <div class="mode-mp-banner">
    <div class="banner-left">
      <div class="banner-badge">👥 Multijugador</div>
      <div class="banner-text">
        <span class="banner-title">¿Quieres jugar {{ label }} en vivo?</span>
        <span class="banner-desc">
          {{ description || 'Crea una sala y compite en tiempo real con hasta 8 jugadores.' }}
        </span>
      </div>
    </div>

    <div class="banner-actions">
      <button type="button" class="banner-btn banner-btn--primary" @click="createRoom">
        Crear sala en vivo →
      </button>

      <button
        type="button"
        class="banner-btn banner-btn--secondary"
        @click="showJoinInput = !showJoinInput"
      >
        {{ showJoinInput ? 'Cancelar' : 'Unirme con código' }}
      </button>
    </div>

    <div v-if="showJoinInput" class="join-inline-form animate-pop">
      <input
        v-model="joinCode"
        type="text"
        placeholder="CÓDIGO (Ej: ABC123)"
        maxlength="6"
        class="join-inline-input"
        @keyup.enter="handleJoin"
      />
      <button type="button" class="join-inline-submit" @click="handleJoin">
        Entrar
      </button>
      <span v-if="joinError" class="join-inline-error">{{ joinError }}</span>
    </div>
  </div>
</template>

<style scoped>
.mode-mp-banner {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(16, 185, 129, 0.1) 100%);
  border: 1px solid rgba(99, 102, 241, 0.25);
  border-radius: var(--radius-lg);
  padding: 1.15rem 1.35rem;
  margin-bottom: 2rem;
}

@media (min-width: 640px) {
  .mode-mp-banner {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
}



.banner-left {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
}

.banner-badge {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.25rem 0.6rem;
  border-radius: var(--radius-full);
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.35);
  white-space: nowrap;
}

.banner-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.banner-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #fff;
}

.banner-desc {
  font-size: 0.8rem;
  color: var(--text-dim);
}

.banner-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.banner-btn {
  padding: 0.55rem 0.95rem;
  border-radius: var(--radius-sm);
  font-size: 0.825rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.banner-btn--primary {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  color: #fff;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.banner-btn--primary:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.banner-btn--secondary {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border-subtle);
  color: #e2e8f0;
}

.banner-btn--secondary:hover {
  background: rgba(255, 255, 255, 0.12);
}

.join-inline-form {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px dashed rgba(255, 255, 255, 0.1);
}

.join-inline-input {
  max-width: 180px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 0.45rem 0.65rem;
  color: #fff;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  text-transform: uppercase;
}

.join-inline-submit {
  padding: 0.45rem 0.85rem;
  background: var(--primary);
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 0.825rem;
  font-weight: 600;
  cursor: pointer;
}

.join-inline-error {
  font-size: 0.75rem;
  color: #f87171;
}

/* Phone layout: the badge used to sit beside the text and squeeze it into a
   narrow column; stack it and give the actions the full width. */
@media (max-width: 639px) {
  .mode-mp-banner {
    padding: 1rem;
  }

  .banner-left {
    flex-direction: column;
    gap: 0.5rem;
  }

  .banner-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .banner-btn {
    width: 100%;
    min-height: 2.75rem;
  }

  .join-inline-form {
    flex-wrap: wrap;
  }

  .join-inline-input {
    flex: 1 1 auto;
    min-width: 0;
    max-width: none;
  }

  .join-inline-submit {
    flex: 0 0 auto;
    min-height: 2.5rem;
  }
}
</style>
