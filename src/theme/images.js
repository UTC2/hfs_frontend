import { Asset } from 'expo-asset'
import logosm from '../../assets/images/logo-sm.png'

const images = {
  logo_sm: logosm,
  logo_lg: require('../../assets/images/logo-lg.png'),
}

// image preloading
export const imageAssets = Object.keys(images).map((key) => Asset.fromModule(images[key]).downloadAsync())

export default images
