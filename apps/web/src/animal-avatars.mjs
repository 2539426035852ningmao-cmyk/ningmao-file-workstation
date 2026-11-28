export const animals = [
  ["otter", "水獭"], ["penguin", "企鹅"], ["capybara", "水豚"], ["red-panda", "小熊猫"],
  ["fox", "狐狸"], ["cat", "小猫"], ["shiba", "柴犬"], ["rabbit", "兔子"],
  ["bear", "小熊"], ["panda", "大熊猫"], ["koala", "考拉"], ["seal", "海豹"],
  ["raccoon", "浣熊"], ["squirrel", "松鼠"], ["hedgehog", "刺猬"], ["frog", "青蛙"],
  ["duck", "小鸭"], ["chick", "小鸡"], ["owl", "猫头鹰"], ["deer", "小鹿"],
  ["sheep", "绵羊"], ["elephant", "小象"], ["tiger", "小虎"], ["hamster", "仓鼠"],
];

export const avatarSize = 160;
export const photoAvatarId = /^[a-f0-9]{32}$/;
export const isAnimalAvatar = id => animals.some(animal => animal[0] === id);

export function defaultAnimalAvatar(accountId) {
  let hash = 0;
  for (const character of accountId) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
  return animals[hash % animals.length][0];
}
