<script setup lang="ts">
import { ref, onMounted } from 'vue';

const repoData = ref({
  name: 'corvo007/Gemini-Subtitle-Pro',
  stars: '-',
  forks: '-',
  version: '-',
});

const formatNumber = (num: number): string => {
  return num > 1000 ? (num / 1000).toFixed(1) + 'k' : num.toString();
};

onMounted(async () => {
  try {
    // Fetch Repo Info (Stars, Forks)
    const repoRes = await fetch('https://api.github.com/repos/corvo007/Gemini-Subtitle-Pro');
    const repoJson = await repoRes.json();
    
    // Fetch Latest Release
    const releaseRes = await fetch('https://api.github.com/repos/corvo007/Gemini-Subtitle-Pro/releases/latest');
    const releaseJson = await releaseRes.json();

    repoData.value = {
      name: repoJson.full_name || 'corvo007/Gemini-Subtitle-Pro',
      stars: typeof repoJson.stargazers_count === 'number' ? formatNumber(repoJson.stargazers_count) : '-',
      forks: typeof repoJson.forks_count === 'number' ? formatNumber(repoJson.forks_count) : '-',
      version: releaseJson.tag_name || 'latest',
    };
  } catch (e) {
    console.error('Failed to fetch GitHub stats:', e);
  }
});
</script>

<template>
  <a
    href="https://github.com/corvo007/Gemini-Subtitle-Pro"
    target="_blank"
    rel="noopener"
    class="github-card"
  >
    <!-- Left: GitHub Logo -->
    <div class="logo-container">
      <svg height="24" viewBox="0 0 16 16" version="1.1" width="24" aria-hidden="true" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
      </svg>
    </div>

    <!-- Right: Info -->
    <div class="info-container">
      <!-- Top: Repo Name -->
      <div class="repo-name">{{ repoData.name }}</div>
      
      <!-- Bottom: Stats Row -->
      <div class="stats-row">
        <!-- Version -->
        <div class="stat-item">
          <svg class="stat-icon" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.75 1.75 0 0 1 1 7.775Zm1.5 0c0 .466.184.912.513 1.237l6.25 6.25a.25.25 0 0 0 .354 0l5.026-5.026a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"></path></svg>
          <span>{{ repoData.version }}</span>
        </div>

        <!-- Stars -->
        <div class="stat-item">
          <svg class="stat-icon" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.719-4.192-3.046-2.97a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.768 1.456-.528-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z"></path></svg>
          <span>{{ repoData.stars }}</span>
        </div>

        <!-- Forks -->
        <div class="stat-item">
          <svg class="stat-icon" viewBox="0 0 16 16" version="1.1" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"></path></svg>
          <span>{{ repoData.forks }}</span>
        </div>
      </div>
    </div>
  </a>
</template>

<style scoped>
.github-card {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  margin-left: 20px;
  color: var(--vp-c-text-1);
  text-decoration: none;
  font-size: 12px;
  line-height: normal;
}

.github-card:hover {
  text-decoration: none;
}

.logo-container {
  display: flex;
  align-items: center;
  color: var(--vp-c-text-1);
}

.info-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.repo-name {
  font-weight: 600;
  font-size: 13px;
}

.stats-row {
  display: flex;
  gap: 12px;
  color: var(--vp-c-text-2);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stat-icon {
  width: 12px;
  height: 12px;
  fill: currentColor;
}

@media (max-width: 768px) {
  .info-container {
    display: none;
  }
}
</style>

