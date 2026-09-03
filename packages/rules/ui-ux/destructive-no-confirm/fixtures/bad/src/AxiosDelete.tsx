import axios from "axios";

export function RemoveItem({ id }: { id: string }) {
  return <button onClick={() => axios.delete(`/items/${id}`)}>Remove</button>;
}
