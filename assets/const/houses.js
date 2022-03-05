import inter1 from '../images/interior1.jpg'
import inter2 from '../images/interior2.jpg'
import inter3 from '../images/interior3.jpg'
import house1 from '../images/house1.jpg'
import house2 from '../images/house2.jpg'

const houses = [
  {
    id: '1',
    title: 'Entire guest suite',
    location: 'East Side Cedar Cottage Toronto',
    image: house1,
    details:
      'This building is located in the Oliver area, withing walking distance of shops...',
    interiors: [inter1, inter2, inter3],
  },
  {
    id: '2',
    title: 'Private room in house',
    location: 'Down town house suite Toronto',
    image: house2,
    details:
      'This building is located in the Oliver area, withing walking distance of shops...',
    interiors: [inter1, inter2, inter3],
  },
  {
    id: '3',
    title: 'Entire apartment',
    location: '3Mins to Skytrain/Garden/Stadium/100% Toronto',
    image: house2,
    details:
      'This building is located in the Oliver area, withing walking distance of shops...',
    interiors: [inter1, inter2, inter3],
  },
  {
    id: '4',
    title: 'Private room in apartment',
    location: 'Small room in cozy DT Vancouver apartment! Toronto',
    image: house2,
    details:
      'This building is located in the Oliver area, withing walking distance of shops...',
    interiors: [inter1, inter2, inter3],
  },
]

export default houses
