import { AbsDownloader } from '@/plugins/capacitor'

// Auto-resolves a download folder for the given media type without ever blocking on a
// folder-picker modal, for use by quick-action flows (Download & Play) where speed matters
// more than folder choice - the user can still use the existing explicit download flows if
// they want control over which folder is used.
export async function resolveDownloadFolder(context, mediaType) {
  const localFolders = (await context.$db.getLocalFolders()) || []
  const foldersWithMediaType = localFolders.filter((lf) => lf.mediaType == mediaType)
  if (foldersWithMediaType.length === 1) return foldersWithMediaType[0]
  // Zero folders configured, or more than one ambiguous choice - default to internal storage
  // (native creates it automatically if it doesn't exist yet).
  return { id: `internal-${mediaType}`, mediaType }
}

// Downloads whichever of the given (already sequence-ordered) queue items don't have a local
// copy, in array order, without waiting for one to finish before starting the next - the native
// download queue already prioritizes by insertion order, so this alone is enough to make sure
// the next-needed item gets download priority.
export async function downloadMissingItems(context, items) {
  const missingItems = items.filter((item) => !item.localLibraryItem)
  if (!missingItems.length) return

  const folderByMediaType = {}
  for (const item of missingItems) {
    const mediaType = item.episodeId ? 'podcast' : 'book'
    if (!folderByMediaType[mediaType]) {
      folderByMediaType[mediaType] = await resolveDownloadFolder(context, mediaType)
    }
    AbsDownloader.downloadLibraryItem({
      libraryItemId: item.libraryItemId,
      episodeId: item.episodeId || undefined,
      localFolderId: folderByMediaType[mediaType].id
    }).catch((error) => {
      console.error('[bulkDownload] Failed to start download for', item.libraryItemId, error)
    })
  }
}
