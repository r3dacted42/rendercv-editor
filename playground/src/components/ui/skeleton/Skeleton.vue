<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { cn } from '@r3dacted42/rendercv-form'

interface SkeletonProps {
  class?: HTMLAttributes['class']
}

const props = defineProps<SkeletonProps>()
</script>

<template>
  <div
    data-slot="skeleton"
    :class="cn('bg-muted rounded-none animate-pulse', props.class)"
  />
</template>
