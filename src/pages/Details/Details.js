import React from 'react'
import PropTypes from 'prop-types'
import {
  Text,
  View,
  SafeAreaView,
  ScrollView,
  ImageBackground,
  Image,
  FlatList,
} from 'react-native'
import Icon from 'react-native-vector-icons/MaterialIcons'
import style from './style'
import COLORS from '../../../assets/const/colors'

const InteriorCard = ({ interior }) => (
  <Image source={interior} style={style.interiorImage} />
)

const DetailScreen = ({ navigation, route }) => {
  const house = route.params
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* House image */}

        <View style={style.backgroundImageContainer}>
          <ImageBackground style={style.backgroundImage} source={house.image}>
            <View style={style.header}>
              <View style={style.headerBtn}>
                <Icon
                  name="arrow-back-ios"
                  size={20}
                  onPress={navigation.goBack}
                />
              </View>
              <View style={style.headerBtn}>
                <Icon name="favorite" size={20} color={COLORS.red} />
              </View>
            </View>
          </ImageBackground>

          {/* Virtual Tag View */}
          <View style={style.virtualTag}>
            <Text style={{ color: COLORS.white }}>Virtual tour</Text>
          </View>
        </View>

        <View style={style.detailsContainer}>
          {/* Name and rating view container */}
          <View
            style={{ flexDirection: 'row', justifyContent: 'space-between' }}
          >
            <Text style={{ fontSize: 20, fontWeight: 'bold' }}>
              {house.title}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={style.ratingTag}>
                <Text style={{ color: COLORS.white }}>4.8</Text>
              </View>
              <Text style={{ fontSize: 13, marginLeft: 5 }}>155 ratings</Text>
            </View>
          </View>

          {/* Location text */}
          <Text style={{ fontSize: 16, color: COLORS.grey }}>
            {house.location}
          </Text>

          {/* Facilities container */}
          <View style={{ flexDirection: 'row', marginTop: 20 }}>
            <View style={style.facility}>
              <Icon name="hotel" size={18} />
              <Text style={style.facilityText}>2</Text>
            </View>
            <View style={style.facility}>
              <Icon name="bathtub" size={18} />
              <Text style={style.facilityText}>2</Text>
            </View>
            <View style={style.facility}>
              <Icon name="aspect-ratio" size={18} />
              <Text style={style.facilityText}>100m area</Text>
            </View>
          </View>
          <Text style={{ marginTop: 20, color: COLORS.grey }}>
            {house.details}
          </Text>

          {/* Interior list */}
          <FlatList
            contentContainerStyle={{ marginTop: 20 }}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(_, key) => key.toString()}
            // eslint-disable-next-line react/prop-types
            data={house.interiors}
            renderItem={({ item }) => <InteriorCard interior={item} />}
          />

          {/* footer container */}
          <View style={style.footer}>
            <View>
              <Text
                style={{ color: COLORS.blue, fontWeight: 'bold', fontSize: 18 }}
              >
                $1,500
              </Text>
              <Text
                style={{ fontSize: 12, color: COLORS.grey, fontWeight: 'bold' }}
              >
                Total Price
              </Text>
            </View>
            <View style={style.bookNowBtn}>
              <Text style={{ color: COLORS.white }}>Book Now</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
export default DetailScreen
DetailScreen.propTypes = {
  route: PropTypes.shape({
    params: PropTypes.shape({ from: PropTypes.string }),
  }),
  navigation: PropTypes.shape({
    goBack: PropTypes.func,
  }),
}

DetailScreen.defaultProps = {
  route: { params: { from: '' } },
  navigation: { goBack: () => null },
}
InteriorCard.propTypes = {
  interior: Image.propTypes.source.isRequired,
}
