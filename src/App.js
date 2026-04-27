import React, { useState, useEffect } from 'react'
import { View } from 'react-native'
import { Provider } from 'react-redux'
import store from 'utils/store'
import 'utils/ignore'

// assets
import { imageAssets } from 'theme/images'
import { fontAssets } from 'theme/fonts'
import Navigator from './navigator'

const App = () => {
  const [didLoad, setDidLoad] = useState(false)

  useEffect(() => {
    let cancelled = false
    const handleLoadAssets = async () => {
      try {
        await Promise.all([...imageAssets, ...fontAssets])
      } catch (err) {
        // Don't hang the UI on a missing/corrupt asset; log and continue.
        console.warn('Asset preload failed; continuing with fallbacks.', err)
      }
      if (!cancelled) setDidLoad(true)
    }
    handleLoadAssets()
    return () => {
      cancelled = true
    }
  }, [])

  return didLoad ? (
    <Provider store={store}>
      <Navigator />
    </Provider>
  ) : (
    <View />
  )
}

export default App
