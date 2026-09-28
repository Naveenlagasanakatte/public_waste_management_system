# Hardware Wiring & Assembly Guide (SWMS-2026-P1)

## 1. Pin Connections Overview

```
                 +---------------------+
                 |     ESP32 DevKit    |
                 |                     |
    Organic  --->| GPIO 5  (TRIG)      |
    Sensor   --->| GPIO 18 (ECHO)      |
                 |                     |
    Dry      --->| GPIO 19 (TRIG)      |
    Sensor   --->| GPIO 21 (ECHO)      |
                 |                     |
    Status   --->| GPIO 2  (LED)       |
                 |                     |
                 |  5V   GND           |
                 +---+-----+-----------+
                     |     |
               (shared 5V and GND rail)
```

## 2. Voltage Divider for 5V -> 3.3V Echo Protection

HC-SR04 ECHO pins output a 5V TTL pulse. While ESP32 GPIOs often tolerate 5V briefly in prototype builds, adding a 2-resistor voltage divider is recommended for durability:

```
HC-SR04 ECHO ----[ 1kΩ Resistor ]----+---- ESP32 GPIO (18 or 21)
                                      |
                                [ 2kΩ Resistor ]
                                      |
                                     GND
```
*Output voltage:* $5\text{V} \times \frac{2\text{k}\Omega}{1\text{k}\Omega + 2\text{k}\Omega} = 3.33\text{V}$.

## 3. Power Distribution

- **Prototype:** Standard Micro-USB port from 5V / 1A USB adapter or power bank.
- **Production / Field Unit:** 6V 3W Solar Panel $\to$ TP4056 Lithium battery charge controller $\to$ 18650 Li-ion battery (3.7V 2600mAh) $\to$ MT3608 Step-up boost converter (adjusted to 5.0V output to ESP32 VIN).
