import { Meteor } from "meteor/meteor";

// oxlint-disable-next-line unicorn/prefer-add-event-listener -- onbeforeunload's return value triggers the confirmation dialog
window.onbeforeunload = () => {
  if ((Meteor as any).connection._anyMethodsAreOutstanding()) {
    return "还有修改正在提交到服务器。现在离开可能丢失这些修改。";
  }
  return undefined;
};
