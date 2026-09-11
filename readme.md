# Audiobookshelf Plus (unofficial mobile app fork)

**Plus** is an unofficial fork of the [Audiobookshelf](https://audiobookshelf.org) mobile app,
built and maintained independently of the official project. Audiobookshelf itself is a
self-hosted audiobook and podcast server.

This fork tracks [upstream `master`](https://github.com/advplyr/audiobookshelf-app) and is
periodically rebased onto each new official release, so it stays current with all official
fixes and features while adding the changes below on top.

**This fork is Android-only.** The iOS side is not maintained here — changes, builds, and
testing are focused entirely on Android.

**Not affiliated with or endorsed by the official Audiobookshelf project.** All credit for the
original app goes to [advplyr](https://github.com/advplyr) and the Audiobookshelf contributors.
This fork exists to carry a small set of additional fixes/features that aren't (yet, or won't
be) in the official app.

### What's different from official

- **Continuous playback for downloaded series/collections** — automatically advances to the
  next downloaded book in a series instead of stopping after one.
- **More reliable background playlist advancement for podcasts** — survives Android Doze mode,
  keeps CPU/network awake during transitions, correctly forwards playback-ended state to the UI
  when backgrounded, and pauses properly on Bluetooth disconnect instead of continuing to play
  through the phone speaker.
- **Auto-play next episode** when playing through a podcast playlist.
- **Fixed a bug where downloading a series would silently stall** after the first book
  (a race condition/permanent lock in the download queue) — inherited for free from an upstream
  rewrite this fork rebases onto.
- **Cross-library downloaded-item recognition** — if the same book exists in more than one of
  your libraries, downloading it once now shows it as downloaded everywhere it appears, instead
  of only in the library you downloaded it from.
- **Rescan a local folder** — a "Rescan Folder" action on the local folder detail page picks up
  books that already exist on disk (from before cross-library recognition existed, from another
  install, or from the official app's own download folder) and links them back to your library
  without re-downloading.
- **Distinct app identity** — installs as "Audiobookshelf+" with its own icon (a bronze plus
  badge over the official icon), so it's visually distinguishable from the official app and can
  be installed alongside it.

### Getting builds

This fork does not publish to the Play Store or TestFlight. Debug APKs are built from the
`plus` branch — see the build instructions below, or check
[Releases](https://github.com/ADD-OCD/audiobookshelf-app/releases) if any are published.

---

[Official project repo: github.com/advplyr/audiobookshelf](https://github.com/advplyr/audiobookshelf) or the project site [audiobookshelf.org](https://audiobookshelf.org)

Join the official community on [discord](https://discord.gg/pJsjuNCKRq) — this fork is not
supported there; open an issue on this repo instead for fork-specific problems.

**Requires an Audiobookshelf server to connect with**

<img alt="Screenshot" src="https://github.com/advplyr/audiobookshelf-app/raw/master/screenshots/DeviceDemoScreens.png" />

## Contributing

This application is built using [NuxtJS](https://nuxtjs.org/) and [Capacitor](https://capacitorjs.com/) in order to run on both iOS and Android on the same code base.

### Localization

Thank you to [Weblate](https://hosted.weblate.org/engage/audiobookshelf/) for hosting our localization infrastructure pro-bono. If you want to see Audiobookshelf in your language, please help us localize. Additional information on helping with the translations [here](https://www.audiobookshelf.org/faq#how-do-i-help-with-translations). <a href="https://hosted.weblate.org/engage/audiobookshelf/"> <img src="https://hosted.weblate.org/widget/audiobookshelf/abs-mobile-app/horizontal-auto.svg" alt="Translation status" /> </a>

### Windows Environment Setup for Android

Required Software:

- [Git](https://git-scm.com/downloads)
- [Node.js](https://nodejs.org/en/) (version 20)
- Code editor of choice([VSCode](https://code.visualstudio.com/download), etc)
- [Android Studio](https://developer.android.com/studio)
- [Android SDK](https://developer.android.com/studio)

<details>
<summary>Install the required software with <a href=(https://docs.microsoft.com/en-us/windows/package-manager/winget/#production-recommended)>winget</a></summary>

<p>
Note: This requires a PowerShell prompt with winget installed.  You should be able to copy and paste the code block to install.  If you use an elevated PowerShell prompt, UAC will not pop up during the installs.

```PowerShell
winget install -e --id Git.Git; `
winget install -e --id Microsoft.VisualStudioCode; `
winget install -e --id  Google.AndroidStudio; `
winget install -e --id OpenJS.NodeJS --version 20.11.0;
```

![](/screenshots/dev_setup_windows_winget.png)

</p>
</details>
<br>

Your Windows environment should now be set up and ready to proceed!

### Mac Environment Setup for Android

Required Software:

- [Android Studio](https://developer.android.com/studio)
- [Node.js](https://nodejs.org/en/) (version 20)
- [Cocoapods](https://guides.cocoapods.org/using/getting-started.html#installation)
- [Android SDK](https://developer.android.com/studio)

<details>
<summary>Install the required software with <a href=(https://brew.sh/)>homebrew</a></summary>

<p>

```zsh
brew install android-studio node cocoapods
```

</p>
</details>

### Start working on the Android app

Clone or fork the project from terminal or powershell and `cd` into the project directory.

Install the required node packages:

```shell
npm install
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_android_npm_install.png)

</details>
<br>

Generate static web app:

```shell
npm run generate
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_android_npm_run.png)

</details>
<br>

Copy web app into native android/ios folders:

```shell
npx cap sync
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_android_cap_sync.png)

</details>
<br>

Open Android Studio:

```shell
npx cap open android
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_cap_android.png)

</details>
<br>

Start coding!

After making changes to the JS layer you need to rebuild the nuxt pages and sync them to the native shells:

```shell
npm run sync
```

### Mac Environment Setup for iOS

Required Software:

- [Xcode](https://developer.apple.com/xcode/)
- [Node.js](https://nodejs.org/en/)
- [Cocoapods](https://guides.cocoapods.org/using/getting-started.html#installation)

### Start working on the iOS app

Clone or fork the project in the terminal and `cd` into the project directory.

Install the required node packages:

```shell
npm install
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_ios_npm_install.png)

</details>
<br>

Generate static web app:

```shell
npm run generate
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_ios_npm_generate.png)

</details>
<br>

Copy web app into native android/ios folders:

```shell
npx cap sync
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_ios_cap_sync.png)

</details>
<br>

Open Xcode:

```shell
npx cap open ios
```

<details>
<summary>Expand for screenshot</summary>

![](/screenshots/dev_setup_ios_cap_open.png)

</details>
<br>

Start coding!

After making changes to the JS layer you need to rebuild the nuxt pages and sync them to the native shells:

```shell
npm run sync
```
