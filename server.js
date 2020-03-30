const {GraphQLScalarType} = require("graphql");

const { ApolloServer, gql, PubSub, withFilter, UserInputError } = require('apollo-server');

const users = [
  {
    username: 'testuser',
    id: 'ID_USER_TEST_USER'
  },
  {
    username: 'adam',
    id: 'ID_USER_ADAM'
  },
  {
    username: 'robot',
    id: 'ID_USER_ROBOT'
  },
  {
    username: 'aleksandra',
    id: 'ID_USER_ALEKSANDRA'
  }
];

const tokens = [
  {
    jwt: 'token_for_testuser',
    userId: 'ID_USER_TEST_USER'
  },
  {
    jwt: 'token_for_adam',
    userId: 'ID_USER_ADAM'
  },
  {
    jwt: 'token_for_robot',
    userId: 'ID_USER_ROBOT'
  },
  {
    jwt: 'token_for_aleksandra',
    userId: 'ID_USER_ALEKSANDRA'
  },
];

const conversations = [
  {
    id: 'conv1',
    users: [users[0], users[1]],
    messages: [
      {
        author: users[0],
        text: 'lorem ipsum ',
        createdAt: new Date(1585129870344),
        readBy: [],
        id: "rand1"
      },
      {
        author: users[1],
        text: 'Other text',
        createdAt: new Date(1585517339938),
        readBy: [],
        id: "rand2"
      }
    ],
    lastMessageCreatedAt: new Date(1585517339938)
  },
  {
    id: 'conv2',
    users: [users[0], users[2]],
    lastMessageCreatedAt: new Date(1585129878644),
    messages: [
      {
        author: users[0],
        text: 'Litwo ojczyzno moja',
        createdAt: new Date(1585129870344),
        readBy: [],
        id: "rand3"
      },
      {
        author: users[2],
        text: 'Ty jestes jak zdrowie',
        createdAt: new Date(1585129878344),
        readBy: [],
        id: "rand4"
      },
      {
        author: users[2],
        text: 'ile Cie trzeba cenic ten tylko sie dowie',
        createdAt: new Date(1585129878644),
        readBy: [],
        id: "rand5"
      }
    ]
  },
  {
    id: 'conv3',
    users: [users[1], users[2]],
    lastMessageCreatedAt: new Date(1585129878344),
    messages: [
      {
        author: users[1],
        text: 'ktos cie stracil',
        createdAt: new Date(1585129870344),
        readBy: [],
        id: "rand6"
      },
      {
        author: users[2],
        text: 'Dzis piekno Twe w calej ozdobie',
        createdAt: new Date(1585129878344),
        readBy: [],
        id: "rand7"
      }
    ]
  },
];

function getUser(token) {
  const userWithToken = tokens.find(t => t.jwt === token);
  if (userWithToken) {
    return users.find(user => user.id === userWithToken.userId);
  } else {
    return null;
  }
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/** Simple login which requires only valid username */
function login (username, _password) {
  const user = users.find(u => u.username === username);
  if (!user) {
    throw new UserInputError('Wrong credentials!');
  }
  const token = tokens.find(t => t.userId === user.id);
  if (!token) {
    throw new UserInputError('Wrong credentials!');
  }
  return {jwt: token.jwt};
}

const typeDefs = gql`  
  scalar Date

  type Message {
    author: User!
    text: String!
    createdAt: Date!
    conversation: Conversation!
    readBy: [User!]!
    id: ID!
  }
  
  type Conversation {
    users: [User!]!
    messages: [Message!]!
    id: ID!
    lastMessageCreatedAt: Date
  }
  
  type User {
    id: ID!
    username: String!
    # connected: Boolean!
  }
  
  type Query {
    me: User!
    messagesByConversationId(id: ID!): [Message!]!
    conversations: [Conversation!]!
    users: [User!]!
  }
  
  type Token {
    jwt: String!
  }
  
  type Mutation {
    sendMessage(conversationId: ID!, text: String!): Message! 
    createConversation(userIds: [ID!]!): Conversation!
    markMessageAsRead(messageId: ID!): Message!
    signin(username: String!, password: String!): Token!
  }
  
  type Subscription {
    messageAdded(userId: ID!): Message!
  }

`;

const pubsub = new PubSub();

const MESSAGE_ADDED = "MESSAGE_ADDED";

const resolvers = {
  Date: new GraphQLScalarType({
    name: 'Date',
    description: 'Date custom scalar type',
    parseValue(value) {
      return new Date(value);
    },
    serialize(value) {
      return value.getTime();
    },
    parseLiteral(ast) {
      if (ast.kind === Kind.INT) {
        return parseInt(ast.value, 10);
      }
      return null;
    },
  }),
  Query: {
    me: (_parent, _args, context) => context.user,
    messagesByConversationId: (_, args) => {
      const conversation = conversations.find(conversation => conversation.id === args.id);
      if (conversation) {
        return conversation.messages;
      } else {
        return [];
      }
    },
    conversations: (_parent, _args, context) => conversations.filter(conversation => conversation.users.find(user => user.id === context.user.id)),
    users: (_parent, _args, context) => users.filter(user => user.id !== context.user.id)
  },
  Message: {
    readBy: (parent, args) => users.filter(user => parent.readBy.includes(user.id))
  },
  Mutation: {
    signin: (_, {username, password}) => {
      return login(username, password);
    },
    markMessageAsRead: (_, {messageId}, context) => {
      const messages = conversations.map(conversation => conversation.messages).flat();
      const msg = messages.find(message => message.id === messageId);

      msg.readBy.push(context.user.id);

      const conversation = conversations.find(conv => conv.messages.find(message => message.id === msg.id));
      return {...msg, conversation};
    },
    createConversation: (_, {userIds}) => {
      const conversation = {
        users: users.filter(user => userIds.includes(user.id)),
        messages: [],
        id: uuidv4(),
        lastMessageCreatedAt: new Date()
      };
      conversations.push(conversation);
      return conversation;
    },
    sendMessage: (_, {conversationId, text}, context) => {
      const conversation = conversations.find(conversation => conversation.id === conversationId);
      const time = new Date();

      conversation.lastMessageCreatedAt = time;

      const msg = {
        id: uuidv4(),
        text,
        createdAt: time,
        author: context.user,
        readBy: [],
        users: conversation.users,
        conversation: conversation
      };
      if (conversation) {
        conversation.messages.push(msg);
      }
      pubsub.publish(MESSAGE_ADDED, { messageAdded: msg });
      return msg;
    }

  },
  Subscription: {
    messageAdded: {
      subscribe: withFilter(
        () => pubsub.asyncIterator(MESSAGE_ADDED),
        (payload, variables) => {
          return !!payload.messageAdded.users.find(user => user.id === variables.userId);
        },
      ),
    },
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req, connection }) => {
    if (connection) {
      return connection.context;
    } else {
      const token = req.headers.authorization || '';
      const user = getUser(token);
      return { user };
    }
  },
});

// The `listen` method launches a web server.
server.listen().then(({ url,server }) => {
  console.log(`🚀  Server ready at ${url}`);
});