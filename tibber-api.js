/**
 * Tibber API Client
 * =================
 *
 * Ein JavaScript-Client für die Tibber GraphQL API.
 *
 * Die Tibber API ermöglicht Zugriff auf:
 * - Strompreise (aktuell, heute, morgen)
 * - Verbrauchsdaten (stündlich, täglich, wöchentlich, monatlich)
 * - Home-Informationen (Adresse, Zähler-Typ, etc.)
 * - Push-Benachrichtigungen an die Tibber App
 *
 * API-Endpunkt: https://api.tibber.com/v1-beta/gql (GraphQL)
 * Token erstellen: https://developer.tibber.com
 * Demo-Token: 5K4MVS-OjfWhK_4yrjOlFe1F6kJXPVf7eQYggo8ebAE
 */

import "dotenv/config";

const API_URL = "https://api.tibber.com/v1-beta/gql";
const DEMO_TOKEN = "5K4MVS-OjfWhK_4yrjOlFe1F6kJXPVf7eQYggo8ebAE";

export class TibberClient {
  constructor(token) {
    this.token = token || process.env.TIBBER_API_TOKEN || DEMO_TOKEN;
  }

  /**
   * Führt eine GraphQL-Query gegen die Tibber API aus.
   * @param {string} query - GraphQL-Query
   * @returns {Promise<object>} Das "data"-Objekt aus der Antwort
   */
  async query(query) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const result = await res.json();
    if (result.errors) {
      throw new Error(`GraphQL Fehler: ${JSON.stringify(result.errors)}`);
    }

    return result.data;
  }

  // --- Basis-Informationen ---

  /** Gibt Infos über den eingeloggten Benutzer zurück. */
  async getViewer() {
    const data = await this.query(`{
      viewer {
        login
        userId
        name
        websocketSubscriptionUrl
      }
    }`);
    return data.viewer;
  }

  /** Gibt alle Homes des Benutzers zurück. */
  async getHomes() {
    const data = await this.query(`{
      viewer {
        homes {
          id
          appNickname
          address {
            address1
            address2
            address3
            postalCode
            city
            country
          }
          features {
            realTimeConsumptionEnabled
          }
          currentSubscription {
            status
          }
        }
      }
    }`);
    return data.viewer.homes;
  }

  // --- Strompreise ---

  /**
   * Gibt den aktuellen Stundenpreis zurück.
   * @param {string} homeId - Die Home-ID
   */
  async getCurrentPrice(homeId) {
    const data = await this.query(`{
      viewer {
        home(id: "${homeId}") {
          currentSubscription {
            priceInfo {
              current {
                total
                energy
                tax
                startsAt
                currency
                level
              }
            }
          }
        }
      }
    }`);
    return data.viewer.home.currentSubscription.priceInfo.current;
  }

  /**
   * Gibt alle 24 Stundenpreise von heute zurück.
   * @param {string} homeId - Die Home-ID
   */
  async getTodayPrices(homeId) {
    const data = await this.query(`{
      viewer {
        home(id: "${homeId}") {
          currentSubscription {
            priceInfo {
              today {
                total
                energy
                tax
                startsAt
                currency
                level
              }
            }
          }
        }
      }
    }`);
    return data.viewer.home.currentSubscription.priceInfo.today;
  }

  /**
   * Gibt Preise für morgen zurück (verfügbar ab ca. 13:00 Uhr).
   * @param {string} homeId - Die Home-ID
   */
  async getTomorrowPrices(homeId) {
    const data = await this.query(`{
      viewer {
        home(id: "${homeId}") {
          currentSubscription {
            priceInfo {
              tomorrow {
                total
                energy
                tax
                startsAt
                currency
                level
              }
            }
          }
        }
      }
    }`);
    return data.viewer.home.currentSubscription.priceInfo.tomorrow;
  }

  // --- Verbrauchsdaten ---

  /**
   * Gibt historische Verbrauchsdaten zurück.
   * @param {string} homeId - Die Home-ID
   * @param {string} resolution - HOURLY | DAILY | WEEKLY | MONTHLY | ANNUAL
   * @param {number} last - Anzahl der Einträge
   */
  async getConsumption(homeId, resolution = "HOURLY", last = 24) {
    const data = await this.query(`{
      viewer {
        home(id: "${homeId}") {
          consumption(resolution: ${resolution}, last: ${last}) {
            nodes {
              from
              to
              consumption
              consumptionUnit
              cost
              unitPrice
              unitPriceVAT
              currency
            }
          }
        }
      }
    }`);
    return data.viewer.home.consumption.nodes;
  }

  // --- Push-Benachrichtigungen ---

  /**
   * Sendet eine Push-Benachrichtigung an die Tibber App.
   * @param {string} title - Titel
   * @param {string} message - Nachricht
   * @param {string} screenToOpen - Zielscreen (HOME, REPORTS, etc.)
   */
  async sendPushNotification(title, message, screenToOpen = "HOME") {
    const data = await this.query(`
      mutation {
        sendPushNotification(input: {
          title: "${title}"
          message: "${message}"
          screenToOpen: ${screenToOpen}
        }) {
          successful
        }
      }
    `);
    return data.sendPushNotification.successful;
  }
}
