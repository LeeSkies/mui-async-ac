import { useState } from 'react'
import { AsyncAutocomplete } from './AsyncAutocomplete'

interface Geo {
  lat: string;
  lng: string;
}

interface Address {
  street: string;
  suite: string;
  city: string;
  zipcode: string;
  geo: Geo;
}

interface Login {
  uuid: string;
  username: string;
  password: string;
  md5: string;
  sha1: string;
  registered: string;
}

interface Company {
  name: string;
  catchPhrase: string;
  bs: string;
}

interface User {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  birthDate: string;
  login: Login;
  address: Address;
  phone: string;
  website: string;
  company: Company;
}

function App() {
  const [count, setCount] = useState(0)

  return (
    <div style={{ padding: 20, backgroundColor: "lightblue" }}>
      <AsyncAutocomplete<User> url={"https://jsonplaceholder.org/users/"} onChange={(...args) => console.log(...args)} labelField={"firstname"} valueField={"id"} />
    </div>
  )
}

export default App
