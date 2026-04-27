import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import DrawerNavigator from './Drawer'

// Phase 4.9 will gate this on auth.status (Login/Register vs Drawer).
// Kept minimal here so the slice rename in Phase 4.5 builds cleanly.
const Navigator = () => (
  <NavigationContainer>
    <DrawerNavigator />
  </NavigationContainer>
)

export default Navigator
