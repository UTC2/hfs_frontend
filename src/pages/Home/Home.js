/* eslint-disable react/prop-types */
/* eslint-disable react/no-array-index-key */
import React, { useState, useEffect } from 'react'
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
import HomeImage2 from '../../../assets/images/house2.jpg'
import PersonImage from '../../../assets/images/person.jpg'
import HomeImage1 from '../../../assets/images/house1.jpg'
import styles from './style'
import COLORS from '../../../assets/const/colors'
import houses from '../../../assets/const/houses'

const { width } = Dimensions.get('screen')
const optionsList = [
  { title: 'Buy a Home', img: HomeImage1 },
  { title: 'Rent a Home', img: HomeImage2 },
]
const categoryList = ['Popular', 'Recommended', 'Nearest']

const ListCategories = () => {
  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(0)
  return (
    <View style={styles.categoryListContainer}>
      {categoryList.map((category, index) => (
        <Pressable key={index} onPress={() => setSelectedCategoryIndex(index)}>
          <Text
            style={[
              styles.categoryListText,
              index === selectedCategoryIndex && styles.activeCategoryListText,
            ]}
          >
            {category}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}
const Card = ({ house, navigation }) => (
  <Pressable
    activeOpacity={0.8}
    onPress={() => navigation.navigate('DetailScreen', house)}
  >
    <View style={styles.card}>
      {/* House image */}
      <Image source={house.image} style={styles.cardImage} />
      <View style={{ marginTop: 10 }}>
        {/* Title and price container */}
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            marginTop: 10,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: 'bold' }}>
            {house.title}
          </Text>
          <Text
            style={{
              fontWeight: 'bold',
              color: COLORS.blue,
              fontSize: 16,
            }}
          >
            $1,500
          </Text>
        </View>
        {/* Location text */}
        <Text style={{ color: COLORS.grey, fontSize: 14, marginTop: 5 }}>
          {house.location}
        </Text>
        {/* Facilities container */}
        <View style={{ marginTop: 10, flexDirection: 'row' }}>
          <View style={styles.facility}>
            <Icon name="hotel" size={18} />
            <Text style={styles.facilityText}>2</Text>
          </View>
          <View style={styles.facility}>
            <Icon name="bathtub" size={18} />
            <Text style={styles.facilityText}>2</Text>
          </View>
          <View style={styles.facility}>
            <Icon name="aspect-ratio" size={18} />
            <Text style={styles.facilityText}>100m</Text>
          </View>
        </View>
      </View>
    </View>
  </Pressable>
)
const ListOptions = () => (
  <View style={styles.optionListsContainer}>
    {optionsList.map((option, index) => (
      <View style={styles.optionsCard} key={index}>
        {/* House image */}
        <Image source={option.img} style={styles.optionsCardImage} />

        {/* Option title */}
        <Text style={{ marginTop: 10, fontSize: 18, fontWeight: 'bold' }}>
          {option.title}
        </Text>
      </View>
    ))}
  </View>
)

const HomeScreen = ({ navigation }) => {
  useEffect(() => {
    console.log(houses)
  }, [])
  return (
    <SafeAreaView>
      <StatusBar
        translucent={false}
        backgroundColor={COLORS.white}
        barStyle="dark-content"
      />
      <View style={styles.header}>
        <View>
          <Text style={{ color: COLORS.grey }}>Location</Text>
          <Text
            style={{ color: COLORS.dark, fontSize: 20, fontWeight: 'bold' }}
          >
            Canada
          </Text>
        </View>
        <Image style={styles.profileImage} source={PersonImage} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
          }}
        >
          <View style={styles.searchInputContainer}>
            <Icon name="search" color={COLORS.grey} size={25} />
            <TextInput placeholder="Search address, city, location" />
          </View>
          <View style={styles.sortBtn}>
            <Icon name="tune" color={COLORS.white} size={25} />
          </View>
        </View>
        {/* Render list options */}
        <ListOptions />
        {/* Render categories */}
        <ListCategories />
        <FlatList
          snapToInterval={width - 20}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingLeft: 20, paddingVertical: 20 }}
          horizontal
          data={houses}
          renderItem={({ item }) => (
            <Card house={item} navigation={navigation} />
          )}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

HomeScreen.propTypes = {
  navigation: PropTypes.shape({
    navigate: PropTypes.func,
  }),
}

HomeScreen.defaultProps = {
  navigation: { navigate: () => null },
}
Card.propTypes = {
  house: PropTypes.shape({
    location: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    images: PropTypes.node,
  }),
  navigation: PropTypes.shape({
    navigate: PropTypes.func,
  }),
}
Card.defaultProps = {
  house: { title: 'temptyTitle' },
  navigation: { navigate: () => null },
}

export default HomeScreen
