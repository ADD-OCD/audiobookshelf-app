<template>
  <modals-modal v-model="show" :width="400" max-width="95%" height="100%">
    <template #outer>
      <div class="absolute top-11 left-4 z-40">
        <p class="text-white text-2xl truncate">Up Next</p>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden absolute top-0 left-0 flex items-center justify-center" @click="show = false">
      <div class="w-full rounded-lg bg-primary border border-border overflow-y-auto overflow-x-hidden relative mt-16" style="max-height: 80vh" @click.stop.prevent>
        <div v-if="nowPlayingDisplay" class="px-3 py-3 border-b border-fg/10">
          <p class="text-fg-muted text-xs uppercase tracking-wide mb-2">Now Playing</p>
          <div class="flex items-center">
            <covers-book-cover :library-item="nowPlayingDisplay.libraryItemForCover" :width="40" />
            <div class="flex-grow px-3 overflow-hidden">
              <p class="truncate text-sm">{{ nowPlayingDisplay.title }}</p>
              <p class="truncate text-xs text-fg-muted">{{ nowPlayingDisplay.subtitle }}</p>
            </div>
          </div>
        </div>

        <p v-if="upcomingLocal.length" class="text-fg-muted text-xs uppercase tracking-wide px-3 pt-3">Up Next</p>
        <div v-if="!upcomingLocal.length" class="flex h-32 items-center justify-center">
          <p class="text-lg text-fg-muted">Nothing queued up next</p>
        </div>
        <draggable v-else v-model="upcomingLocal" tag="ul" handle=".drag-handle" @end="onDragEnd">
          <li v-for="item in upcomingLocal" :key="itemKey(item)" class="flex items-center px-3 py-2 select-none">
            <span class="material-symbols drag-handle text-fg-muted cursor-grab text-xl mr-1">drag_indicator</span>
            <covers-book-cover :library-item="itemDisplay(item).libraryItemForCover" :width="40" />
            <div class="flex-grow px-3 overflow-hidden">
              <p class="truncate text-sm">{{ itemDisplay(item).title }}</p>
              <p class="truncate text-xs text-fg-muted">{{ itemDisplay(item).subtitle }}</p>
            </div>
            <span class="material-symbols text-fg-muted cursor-pointer text-xl" @click.stop="$emit('remove', item)">close</span>
          </li>
        </draggable>
      </div>
    </div>
  </modals-modal>
</template>

<script>
import draggable from 'vuedraggable'
import { queueItemDisplay } from '@/utils/playbackQueue'

export default {
  components: { draggable },
  props: {
    value: Boolean,
    queue: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      upcomingLocal: []
    }
  },
  watch: {
    queue: {
      immediate: true,
      handler(newQueue) {
        this.upcomingLocal = newQueue ? newQueue.items.slice(newQueue.currentIndex + 1) : []
      }
    }
  },
  computed: {
    show: {
      get() {
        return this.value
      },
      set(val) {
        this.$emit('input', val)
      }
    },
    nowPlayingDisplay() {
      if (!this.queue) return null
      const item = this.queue.items[this.queue.currentIndex]
      return item ? this.itemDisplay(item) : null
    }
  },
  methods: {
    itemDisplay(item) {
      return queueItemDisplay(item)
    },
    itemKey(item) {
      return `${item.libraryItemId || item.localLibraryItem?.id || ''}-${item.episodeId || item.localEpisode?.id || ''}`
    },
    onDragEnd() {
      this.$emit('reorder', this.upcomingLocal)
    }
  }
}
</script>
