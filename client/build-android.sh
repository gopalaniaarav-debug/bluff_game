#!/bin/bash
# Builds a signed release Android App Bundle (.aab) ready for Play Store upload.
# Usage: ./build-android.sh
set -e

export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"

cd "$(dirname "$0")"

npm run build
npx cap sync android
cd android
./gradlew bundleRelease --console=plain

echo ""
echo "Done. Signed bundle at:"
echo "  client/android/app/build/outputs/bundle/release/app-release.aab"
