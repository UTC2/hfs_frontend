/* eslint-disable no-unused-vars */
/* eslint-disable react/prop-types */
/* eslint-disable react/no-array-index-key */
import React, { useState } from 'react'
import PropTypes from 'prop-types'
import {
  Text,
  View,
  StatusBar,
  Pressable,
  SafeAreaView,
  Image,
  ScrollView,
  TextInput,
  FlatList,
  Dimensions,
} from 'react-native'
import Icon from 'react-native-vector-icons/MaterialIcons'

const { width } = Dimensions.get('screen')

const MessageScreen = ({ navigation }) => (
  <View>
    <Text>nothing</Text>
  </View>
)

MessageScreen.propTypes = {
  navigation: PropTypes.shape({
    navigate: PropTypes.func,
  }),
}

MessageScreen.defaultProps = {
  navigation: { navigate: () => null },
}

export default MessageScreen
