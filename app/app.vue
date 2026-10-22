<template>
  <div class="app-fade-in">
    <NuxtPage />
  </div>
</template>

<style scoped>
.app-fade-in {
  animation: fadeIn 0.25s ease-out;
  min-height: 100vh;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
