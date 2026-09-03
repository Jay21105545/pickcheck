import { Avatar } from "../components/Avatar";
import { Card } from "../components/Card";
import { DeleteUserButton } from "../components/DeleteUserButton";
import { Modal } from "../components/Modal";
import { SearchBox } from "../components/SearchBox";
import { SignupForm } from "../components/SignupForm";
import { UserList } from "../components/UserList";

export default function HomePage() {
  return (
    <main>
      <h1>broken-app</h1>
      <Avatar src="/avatar.png" />
      <SearchBox />
      <Card onSelect={() => {}} title="Click me" />
      <SignupForm onSubmit={() => {}} />
      <DeleteUserButton id="1" />
      <Modal>
        <UserList />
      </Modal>
    </main>
  );
}
