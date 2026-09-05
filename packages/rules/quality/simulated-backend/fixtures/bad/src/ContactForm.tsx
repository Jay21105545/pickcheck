// Same shape without the arrow-parameter parens, and with a block body on
// the arrow — both are matched.
export function ContactForm() {
  async function handleSendMessage(e) {
    e.preventDefault();
    await new Promise(resolve => { setTimeout(resolve, 1000); });
    toast.success("Your message has been sent! We'll get back to you soon.");
  }

  return <form onSubmit={handleSendMessage} />;
}
