import Elysia, { t } from "elysia";
import { authPlugin } from "../middleware/authPlugin";
import { prisma } from "../models/db";

import { nanoid } from "nanoid";
import Stripe from "stripe";

const stripeClient = new Stripe(Bun.env.STRIPE_SECRET_KEY as string, {
  apiVersion: "2024-12-18.acacia",
});

export const orderRouter = new Elysia({ prefix: "/orders" })
  .use(authPlugin)
  .post(
    "/",
    async ({ user, body }) => {
      console.log(body);
      console.log("logging body");
      const { orderItems, deliveryAddress, totalPrice } = body;

      // Generate unique order ID
      const orderId = "order_" + nanoid();

      // Create a PaymentIntent with Stripe
      const paymentIntent = await stripeClient.paymentIntents.create({
        amount: totalPrice * 100, // Convert to smallest currency unit
        currency: "inr",
      });

      // Create the order in the database
      const order = await prisma.order.create({
        data: {
          user: {
            connect: {
              id: user.id,
            },
          },
          id: orderId,
          deliveryAddress,
          deliveryStatus: "PENDING",
          totalPrice,
          paymentDetails: {
            amount: paymentIntent.amount,
          },
          paymentIntentId: paymentIntent.id,
          paymentStatus: "PENDING",
        },
      });

      // Create the associated order items
      const __orderItems = await prisma.orderItem.createMany({
        data: orderItems.map((orderItem) => ({
          orderId,
          productId: orderItem.productId,
          quantity: orderItem.quantity,
          price: orderItem.price,
        })),
      });

      // Return the created order and client secret for Stripe
      return {
        order,
        clientSecret: paymentIntent.client_secret,
      };
    },
    {
      body: t.Object({
        deliveryAddress: t.String(),
        totalPrice: t.Number(),
        orderItems: t.Array(
          t.Object({
            productId: t.String(),
            quantity: t.Number(),
            price: t.Number(),
          })
        ),
      }),
    }
  )
  .get("/", async ({ user }) => {
    const orders = await prisma.order.findMany({
      where: {
        userId: user.id,
      },
    });
    return orders;
  });
