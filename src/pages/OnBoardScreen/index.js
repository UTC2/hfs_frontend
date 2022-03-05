import React from 'react'
import {
  StatusBar,
  View,
  Text,
  SafeAreaView,
  Image,
  Pressable,
} from 'react-native'
import COLORS from '../../theme/colors'
import style from './style'
import onboardImage from '../../../assets/images/onboardImage.jpg'

const OnBoardScreen = ({ navigation }) => (
  <SafeAreaView style={{ flex: 1, backgroundColor: 'white' }}>
    <StatusBar translucent backgroundColor={COLORS.transparent} />
    {/* Onboarding Image */}
    <Image source={onboardImage} style={style.image} />
    {/* Indicator container */}
    <View style={style.indicatorContainer}>
      <View style={style.indicator} />
      <View style={style.indicator} />
      <View style={[style.indicator, style.indicatorActive]} />
    </View>
    {/* Title and text container */}
    <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
      {/* Title container */}
      <View>
        <Text style={style.title}>Find your</Text>
        <Text style={style.title}>sweet home</Text>
      </View>
      {/* Text container */}
      <View style={{ marginTop: 10 }}>
        <Text style={style.textStyle}>
          Schedule visits in just a few clicks
        </Text>
        <Text style={style.textStyle}>visit in just a few clicks</Text>
      </View>
    </View>
    {/* Button container */}
    <View
      style={{
        flex: 1,
        justifyContent: 'flex-end',
        paddingBottom: 40,
      }}
    >
      {/* button */}
      <Pressable onPress={() => navigation.navigate('HomeScreen')}>
        <View style={style.btn}>
          <Text style={{ color: 'white' }}>Get Started</Text>
        </View>
      </Pressable>
    </View>
  </SafeAreaView>
)
export default OnBoardScreen
